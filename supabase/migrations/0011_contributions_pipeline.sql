begin;
drop policy contribution_owner_insert on public.contributions;
drop policy contribution_staff_update on public.contributions;
drop policy contribution_object_insert on storage.objects;
drop policy contribution_object_owner_update on storage.objects;
drop policy contribution_object_owner_read on storage.objects;
alter table public.contributions alter column processing_state set default 'AWAITING_UPLOAD';
alter table public.contributions add column upload_key uuid;
alter table public.contributions add constraint contribution_upload_key unique(uploader_id,upload_key);
alter table public.contributions add constraint original_filename_safe check(original_filename !~ '[/\\[:cntrl:]]' and length(original_filename) between 1 and 255 and original_filename not in ('.','..'));
alter table public.contributions add constraint checksum_format check(checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$');
create policy contribution_object_insert on storage.objects for insert to authenticated with check(bucket_id='contributions' and exists(select 1 from public.contributions c where c.object_path=name and c.bucket=bucket_id and c.uploader_id=auth.uid() and c.processing_state='AWAITING_UPLOAD' and c.finalized_at is null));
create policy contribution_object_owner_read on storage.objects for select to authenticated using(bucket_id='contributions' and exists(select 1 from public.contributions c where c.object_path=name and c.bucket=bucket_id and c.uploader_id=auth.uid()));
create function public.create_contribution(p_filename text,p_mime text,p_size bigint,p_category text,p_request uuid) returns public.contributions language plpgsql security definer set search_path=public,pg_temp as $$
declare result contributions; cid uuid=gen_random_uuid();
begin
 perform require_user();perform 1 from profiles where id=auth.uid() for update;
 select * into result from contributions where uploader_id=auth.uid() and upload_key=p_request;
 if found then return result; end if;
 if p_request is null or p_size<=0 or p_size>9007199254740991 or p_mime not in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','text/csv','image/png','image/jpeg') or p_category not in ('QUESTIONS','SOLUTIONS','ANSWER_KEYS','NOTES','ESSAYS','READING','PAST_PAPER','MOCK_TEST') then raise exception 'Unsupported contribution metadata'; end if;
 if (select count(*) from contributions where uploader_id=auth.uid() and created_at>now()-interval '1 hour')>=20 then raise exception 'Upload request limit reached. Resume an existing upload or try again later'; end if;
 insert into contributions(id,uploader_id,original_filename,mime_type,byte_size,category,object_path,upload_key) values(cid,auth.uid(),p_filename,p_mime,p_size,p_category,'contributions/'||auth.uid()||'/'||cid||'/'||p_filename,p_request) returning * into result;
 return result;
end $$;
create function public.finalize_contribution(p_id uuid,p_user uuid,p_size bigint) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare c contributions; job uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server validation required' using errcode='42501'; end if;
 select * into c from contributions where id=p_id and uploader_id=p_user for update;
 if not found then raise exception 'Contribution not found' using errcode='P0002'; end if;
 if p_size<>c.byte_size then raise exception 'Uploaded size does not match original file'; end if;
 if not exists(select 1 from storage.objects where bucket_id=c.bucket and name=c.object_path) then raise exception 'Original object is missing'; end if;
 update contributions set finalized_at=coalesce(finalized_at,now()),processing_state=case when finalized_at is null then 'QUEUED' else processing_state end where id=p_id;
 insert into processing_jobs(kind,contribution_id,idempotency_key,cursor) values('DOCUMENT',p_id,'document:'||p_id,'{"step":"HASH","offset":0}') on conflict(idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into job;
 return job;
end $$;
create table public.staged_items(
 id uuid primary key default gen_random_uuid(),contribution_id uuid references public.contributions(id),job_id uuid references public.processing_jobs(id),
 source_key text not null unique,source_page integer,source_row integer,question_data jsonb not null,validation_errors jsonb not null default '[]',
 status text not null default 'PENDING_REVIEW' check(status in ('PENDING_REVIEW','IMPORTED','REJECTED','DUPLICATE')),duplicate_question_id uuid references public.questions(id),canonical_question_id uuid references public.questions(id),reviewed_by uuid references public.profiles(id),created_at timestamptz not null default now()
);
create index staged_review_idx on public.staged_items(status,created_at);
create table public.reading_chunks(id uuid primary key default gen_random_uuid(),contribution_id uuid not null references public.contributions(id),page_number integer not null,chunk_index integer not null,content text not null,title text not null,search_vector tsvector generated always as(to_tsvector('simple',content)) stored,publication_status text not null default 'DRAFT' check(publication_status in ('DRAFT','PUBLISHED','ARCHIVED')),created_at timestamptz not null default now(),unique(contribution_id,page_number,chunk_index));
create index reading_search_idx on public.reading_chunks using gin(search_vector);
alter table public.staged_items enable row level security;alter table public.reading_chunks enable row level security;
create policy staff on public.staged_items for select using(is_staff());
create policy reading on public.reading_chunks for select using(publication_status='PUBLISHED' or is_staff());
grant select on public.staged_items,public.reading_chunks to authenticated;
grant select on public.processing_jobs,public.processing_artifacts,public.audit_events to authenticated;
create function public.review_staged_item(p_id uuid,p_action text,p_data jsonb default null) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare s staged_items;qid uuid;
begin
 perform require_staff();select * into s from staged_items where id=p_id for update;
 if not found then raise exception 'Staged item not found'; end if;
 if s.status='IMPORTED' then return s.canonical_question_id; end if;
 if p_action='REJECT' then update staged_items set status='REJECTED',reviewed_by=auth.uid() where id=p_id;return null; end if;
 if p_action<>'IMPORT' or p_data is null then raise exception 'Review the canonical fields before importing'; end if;
 qid=save_question(null,p_data||jsonb_build_object('provenance',coalesce(p_data->'provenance','{}')||coalesce(s.question_data->'provenance','{}')||jsonb_build_object('contribution_id',s.contribution_id,'page',s.source_page,'row',s.source_row,'staged_item_id',s.id)));
 update questions set contribution_id=s.contribution_id,source_page=coalesce(s.source_page,source_page) where id=qid;
 update staged_items set status='IMPORTED',canonical_question_id=qid,question_data=p_data,reviewed_by=auth.uid() where id=p_id;
 return qid;
end $$;
create function public.review_reading(p_contribution uuid,p_publish boolean) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin perform require_staff();update reading_chunks set publication_status=case when p_publish then 'PUBLISHED' else 'ARCHIVED' end where contribution_id=p_contribution;if not found then raise exception 'No extracted reading material found'; end if;update contributions set review_state=case when p_publish then 'APPROVED' else 'REJECTED' end where id=p_contribution;insert into audit_events(actor_id,action,target_type,target_id) values(auth.uid(),'READING_REVIEWED','contribution',p_contribution::text);end $$;
alter table public.processing_jobs drop constraint processing_jobs_status_check;
alter table public.processing_jobs add constraint processing_jobs_status_check check(status in ('READY','RUNNING','RETRY','SUCCEEDED','FAILED','DEAD_LETTER','NEEDS_REVIEW'));
alter table public.processing_jobs add column lease_token uuid;
alter table public.processing_jobs add column lease_until timestamptz;
alter table public.processing_jobs add column step_attempts integer not null default 0;
create function public.claim_job(p_worker text) returns public.processing_jobs language plpgsql security definer set search_path=public,pg_temp as $$
declare result processing_jobs;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server worker required' using errcode='42501'; end if;
 select * into result from processing_jobs where ((status in ('READY','RETRY') and available_at<=now()) or (status='RUNNING' and lease_until<now())) and step_attempts<max_attempts order by available_at,id for update skip locked limit 1;
 if not found then return null; end if;
 update processing_jobs set status='RUNNING',locked_by=p_worker,locked_at=now(),lease_until=now()+interval '90 seconds',lease_token=gen_random_uuid(),attempt_count=attempt_count+1,step_attempts=step_attempts+1,updated_at=now() where id=result.id returning * into result;
 return result;
end $$;
create function public.checkpoint_job(p_id uuid,p_lease uuid,p_cursor jsonb,p_status text,p_error jsonb default null) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare job processing_jobs;next_status text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server worker required' using errcode='42501'; end if;
 select * into job from processing_jobs where id=p_id and lease_token=p_lease and status='RUNNING' and lease_until>now() for update;
 if not found then return false; end if;
 if p_status not in ('READY','RETRY','SUCCEEDED','NEEDS_REVIEW') then raise exception 'Invalid checkpoint'; end if;
 next_status=case when p_status='RETRY' and job.step_attempts>=job.max_attempts then 'DEAD_LETTER' else p_status end;
 update processing_jobs set status=next_status,cursor=p_cursor,last_error=p_error,step_attempts=case when p_status='READY' then 0 else step_attempts end,available_at=now()+make_interval(secs=>case when p_status='RETRY' then least(3600,30*power(2,job.step_attempts)::integer) else 0 end),locked_by=null,lease_token=null,lease_until=null,updated_at=now(),completed_at=case when next_status in ('SUCCEEDED','DEAD_LETTER','NEEDS_REVIEW') then now() else null end where id=p_id;
 if next_status in ('DEAD_LETTER','NEEDS_REVIEW') then update contributions set processing_state='NEEDS_REVIEW',error_code=p_error->>'code',error_detail=p_error->>'message' where id=job.contribution_id; end if;
 return true;
end $$;
create function public.retry_job(p_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform require_staff();update processing_jobs set status='READY',step_attempts=0,available_at=now(),last_error=null,completed_at=null where id=p_id and status in ('DEAD_LETTER','NEEDS_REVIEW','FAILED','RETRY');if not found then raise exception 'Job cannot be retried in this state'; end if;
 insert into audit_events(actor_id,action,target_type,target_id) values(auth.uid(),'JOB_RETRIED','processing_job',p_id::text);
end $$;
grant execute on function public.create_contribution(text,text,bigint,text,uuid),public.review_staged_item(uuid,text,jsonb),public.review_reading(uuid,boolean),public.retry_job(uuid) to authenticated;
grant execute on function public.finalize_contribution(uuid,uuid,bigint),public.claim_job(text),public.checkpoint_job(uuid,uuid,jsonb,text,jsonb) to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
commit;
