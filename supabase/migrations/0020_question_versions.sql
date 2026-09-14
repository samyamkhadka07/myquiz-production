begin;

alter table public.media_assets add column source_contribution_id uuid references public.contributions(id);
alter table public.media_assets add column source_page integer check(source_page>0);
alter table public.media_assets add column width integer check(width>0);
alter table public.media_assets add column height integer check(height>0);
create unique index media_assets_extracted_source_idx on public.media_assets(source_contribution_id,source_page) where source_contribution_id is not null;

create table public.question_versions(
 id uuid primary key default gen_random_uuid(),
 question_id uuid not null references public.questions(id) on delete cascade,
 version_number integer not null check(version_number>0),
 question_snapshot jsonb not null,
 media_snapshot jsonb not null default '[]'::jsonb,
 change_reason text not null default 'CONTENT_EDIT',
 changed_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 unique(question_id,version_number)
);
create index question_versions_question_created_idx on public.question_versions(question_id,created_at desc);
alter table public.question_versions enable row level security;
create policy question_versions_staff_read on public.question_versions for select to authenticated using(public.is_staff());

create function public.capture_question_version() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare next_version integer;media jsonb;
begin
 if (to_jsonb(old)-array['lifecycle','verification_status','publication_status','verified_by','verified_at','published_at','archived_at','updated_at'])
    is not distinct from
    (to_jsonb(new)-array['lifecycle','verification_status','publication_status','verified_by','verified_at','published_at','archived_at','updated_at']) then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended(old.id::text,0));
 select coalesce(max(version_number),0)+1 into next_version from question_versions where question_id=old.id;
 select coalesce(jsonb_agg(jsonb_build_object('media_id',l.media_id,'position',l.position,'alt_text',l.alt_text,'caption',l.caption) order by l.position),'[]'::jsonb)
 into media from question_media_links l where l.question_id=old.id;
 insert into question_versions(question_id,version_number,question_snapshot,media_snapshot,changed_by)
 values(old.id,next_version,to_jsonb(old),media,auth.uid());
 return new;
end $$;
create trigger question_capture_version before update on public.questions for each row execute function public.capture_question_version();

create or replace function public.review_staged_item(p_id uuid,p_action text,p_data jsonb default null) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare s staged_items;qid uuid;linked_media_id uuid;combined_provenance jsonb;
begin
 perform require_staff();
 select * into s from staged_items where id=p_id for update;
 if not found then raise exception 'Staged item not found';end if;
 if s.status='IMPORTED' then raise exception 'Staged item was already imported';end if;
 if p_action='REJECT' then update staged_items set status='REJECTED',reviewed_by=auth.uid() where id=p_id;return null;end if;
 if p_action='NEEDS_REVISION' then update staged_items set status='NEEDS_REVISION',question_data=coalesce(p_data,question_data),reviewed_by=auth.uid() where id=p_id;return null;end if;
 if p_action not in ('IMPORT','IMPORT_VERIFY','IMPORT_PUBLISH') or p_data is null then raise exception 'Review canonical fields before importing';end if;
 combined_provenance=coalesce(p_data->'provenance','{}')||coalesce(s.question_data->'provenance','{}')||jsonb_build_object('contribution_id',s.contribution_id,'page',s.source_page,'row',s.source_row,'staged_item_id',s.id);
 qid=save_question(null,p_data||jsonb_build_object('provenance',combined_provenance));
 update questions set contribution_id=s.contribution_id,source_page=coalesce(s.source_page,source_page) where id=qid;
 for linked_media_id in select (value #>> '{}')::uuid from jsonb_array_elements(coalesce(combined_provenance->'media_asset_ids','[]'::jsonb)) loop
  insert into question_media_links(question_id,media_id,position,alt_text,created_by)
  select qid,m.id,coalesce((select max(position)+1 from question_media_links where question_id=qid),0),m.default_alt_text,auth.uid() from media_assets m where m.id=linked_media_id and m.status='ACTIVE'
  on conflict(question_id,media_id) do nothing;
 end loop;
 if p_action in ('IMPORT_VERIFY','IMPORT_PUBLISH') then perform transition_question(qid,'REVIEW');perform transition_question(qid,'VERIFY');end if;
 if p_action='IMPORT_PUBLISH' then perform transition_question(qid,'PUBLISH');end if;
 update staged_items set status='IMPORTED',canonical_question_id=qid,question_data=p_data,reviewed_by=auth.uid() where id=p_id;
 insert into audit_events(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'STAGED_ITEM_'||p_action,'question',qid::text,jsonb_build_object('staged_item_id',p_id));
 return qid;
end $$;

create function public.restore_question_version(p_question uuid,p_version uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v question_versions;s questions;
begin
 perform require_staff();
 select * into v from question_versions where id=p_version and question_id=p_question for update;
 if not found then raise exception 'Question version not found' using errcode='P0002';end if;
 s=jsonb_populate_record(null::questions,v.question_snapshot);
 update questions set
  question_text=s.question_text,option_a=s.option_a,option_b=s.option_b,option_c=s.option_c,option_d=s.option_d,
  correct_answer=s.correct_answer,explanation=s.explanation,option_explanations=s.option_explanations,
  subject_id=s.subject_id,unit_id=s.unit_id,topic_id=s.topic_id,subtopic_id=s.subtopic_id,exam_program_id=s.exam_program_id,
  difficulty=s.difficulty,cognitive_level=s.cognitive_level,source_type=s.source_type,source_year=s.source_year,
  source_document=s.source_document,source_url=s.source_url,source_page=s.source_page,source_question_number=s.source_question_number,
  contribution_id=s.contribution_id,external_source_id=s.external_source_id,provenance=s.provenance,extraction_confidence=s.extraction_confidence,
  lifecycle='STAGED',verification_status='UNVERIFIED',publication_status='DRAFT',verified_by=null,verified_at=null,published_at=null,archived_at=null
 where id=p_question;
 delete from question_media_links where question_id=p_question;
 insert into question_media_links(question_id,media_id,position,alt_text,caption,created_by)
 select p_question,(item->>'media_id')::uuid,(item->>'position')::integer,item->>'alt_text',nullif(item->>'caption',''),auth.uid()
 from jsonb_array_elements(v.media_snapshot) item
 join media_assets m on m.id=(item->>'media_id')::uuid and m.status='ACTIVE';
 insert into audit_events(actor_id,action,target_type,target_id,metadata)
 values(auth.uid(),'QUESTION_VERSION_RESTORED','question',p_question::text,jsonb_build_object('version_id',p_version,'version_number',v.version_number));
end $$;

grant select on public.question_versions to authenticated;
grant execute on function public.restore_question_version(uuid,uuid) to authenticated;
grant execute on function public.review_staged_item(uuid,text,jsonb) to authenticated;
grant all on public.question_versions to service_role;

commit;
