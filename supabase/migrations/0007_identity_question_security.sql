begin;
-- Protected writes use authenticated RPCs; RLS remains defense in depth.
revoke all on public.profiles,public.entitlements,public.questions,public.attempts,public.attempt_questions,public.bookmarks,public.contributions from anon,authenticated;
grant select on public.profiles,public.entitlements,public.attempts,public.attempt_questions,public.bookmarks,public.contributions to authenticated;
revoke all on all sequences in schema public from anon,authenticated;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke all on tables from anon,authenticated;
drop policy profiles_self_update on public.profiles;
drop policy profiles_admin_update on public.profiles;
drop policy attempts_owner_insert on public.attempts;
drop policy published_question_read on public.questions;
drop policy question_staff_write on public.questions;
create policy question_staff_read on public.questions for select to authenticated using(public.is_staff());
grant select on public.questions to authenticated;
create function public.require_user() returns uuid language plpgsql stable security definer set search_path=public,pg_temp as $$
begin if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if; return auth.uid(); end $$;
create function public.require_staff() returns uuid language plpgsql stable security definer set search_path=public,pg_temp as $$
begin perform public.require_user(); if not public.is_staff() then raise exception 'Staff access required' using errcode='42501'; end if; return auth.uid(); end $$;
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into profiles(id,display_name) values(new.id,left(coalesce(nullif(btrim(new.raw_user_meta_data->>'display_name'),''),nullif(split_part(new.email,'@',1),''),'Student'),80));
 insert into entitlements(user_id) values(new.id); return new;
end $$;
create function public.update_profile(p_name text,p_target numeric,p_timezone text,p_program uuid) returns public.profiles language plpgsql security definer set search_path=public,pg_temp as $$
declare result profiles;
begin
 perform require_user();
 if not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'Invalid timezone' using errcode='22023'; end if;
 update profiles set display_name=btrim(p_name),target_score=p_target,timezone=p_timezone,exam_program_id=p_program,updated_at=now() where id=auth.uid() returning * into result;
 return result;
end $$;
create function public.set_user_access(p_user uuid,p_role public.app_role,p_tier public.entitlement_tier,p_ends timestamptz default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform require_user(); if not is_admin() or p_role='SUPER_ADMIN' then raise exception 'Admin access required' using errcode='42501'; end if;
 if p_user=auth.uid() and p_role<>public.current_role() then raise exception 'Self role changes are not allowed' using errcode='42501'; end if;
 update profiles set role=p_role,updated_at=now() where id=p_user;
 if not found then raise exception 'User not found' using errcode='P0002'; end if;
 insert into entitlements(user_id,tier,starts_at,ends_at,granted_by) values(p_user,p_tier,now(),p_ends,auth.uid()) on conflict(user_id) do update set tier=excluded.tier,starts_at=excluded.starts_at,ends_at=excluded.ends_at,granted_by=auth.uid(),updated_at=now();
 insert into audit_events(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'USER_ACCESS_UPDATED','profile',p_user::text,jsonb_build_object('role',p_role,'tier',p_tier));
end $$;
create function public.has_premium() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from entitlements where user_id=auth.uid() and tier='PREMIUM' and starts_at<=now() and (ends_at is null or ends_at>now()))
$$;
alter table public.questions add constraint verification_values check(verification_status in ('UNVERIFIED','VERIFIED','REJECTED'));
alter table public.questions add constraint publication_values check(publication_status in ('DRAFT','PUBLISHED','ARCHIVED'));
alter table public.questions add constraint published_consistency check(publication_status<>'PUBLISHED' or (lifecycle='PUBLISHED' and verification_status='VERIFIED' and correct_answer is not null and explanation is not null and difficulty is not null and cognitive_level is not null));
create function public.validate_question() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.unit_id is null or not exists(select 1 from units where id=new.unit_id and subject_id=new.subject_id) then raise exception 'Unit does not belong to subject' using errcode='22023'; end if;
 if new.topic_id is not null and not exists(select 1 from topics where id=new.topic_id and unit_id=new.unit_id) then raise exception 'Topic does not belong to unit' using errcode='22023'; end if;
 if new.subtopic_id is not null and not exists(select 1 from subtopics where id=new.subtopic_id and topic_id=new.topic_id) then raise exception 'Subtopic does not belong to topic' using errcode='22023'; end if;
 if exists(select 1 from subjects where id=new.subject_id and code='PCL') and new.exam_program_id is null then raise exception 'PCL questions require an explicit program'; end if;
 if new.exam_program_id is not null and not exists(select 1 from exam_programs p join exam_blueprints b on b.exam_group_id=p.exam_group_id join blueprint_allocations a on a.blueprint_id=b.id where p.id=new.exam_program_id and a.unit_id=new.unit_id) then raise exception 'Program does not include this unit' using errcode='22023'; end if;
 if least(length(btrim(new.option_a)),length(btrim(new.option_b)),length(btrim(new.option_c)),length(btrim(new.option_d)))<1 then raise exception 'Four nonempty options required' using errcode='22023'; end if;
 if (select count(distinct lower(btrim(x))) from unnest(array[new.option_a,new.option_b,new.option_c,new.option_d]) x)<>4 then raise exception 'Options must be distinct' using errcode='22023'; end if;
 new.content_fingerprint=encode(sha256(convert_to(lower(regexp_replace(btrim(new.question_text)||'|'||btrim(new.option_a)||'|'||btrim(new.option_b)||'|'||btrim(new.option_c)||'|'||btrim(new.option_d),'\s+',' ','g')),'UTF8')),'hex');
 new.updated_at=now(); return new;
end $$;
create trigger question_validate before insert or update on public.questions for each row execute function public.validate_question();
create function public.save_question(p_id uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare qid uuid; old questions; item questions;
begin
 perform require_staff();
 if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('question_text','option_a','option_b','option_c','option_d','correct_answer','explanation','option_explanations','subject_id','unit_id','topic_id','subtopic_id','difficulty','cognitive_level','source_type','source_year','source_document','source_url','source_page','source_question_number','provenance','exam_program_id')) then raise exception 'Unsupported question field' using errcode='22023'; end if;
 item=jsonb_populate_record(null::questions,p_data);
 if p_id is not null then
  select * into old from questions where id=p_id for update;
  if not found then raise exception 'Question not found' using errcode='P0002'; end if;
  if old.lifecycle='PUBLISHED' then raise exception 'Archive the published question before editing' using errcode='22023'; end if;
 end if;
 qid=coalesce(p_id,gen_random_uuid());
 insert into questions(id,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation,option_explanations,subject_id,unit_id,topic_id,subtopic_id,difficulty,cognitive_level,source_type,source_year,source_document,source_url,source_page,source_question_number,provenance,exam_program_id,content_fingerprint,created_by)
 values(qid,item.question_text,item.option_a,item.option_b,item.option_c,item.option_d,item.correct_answer,item.explanation,coalesce(item.option_explanations,'{}'),item.subject_id,item.unit_id,item.topic_id,item.subtopic_id,item.difficulty,item.cognitive_level,coalesce(item.source_type,'MANUAL'),item.source_year,item.source_document,item.source_url,item.source_page,item.source_question_number,coalesce(item.provenance,'{}'),item.exam_program_id,'pending',auth.uid())
 on conflict(id) do update set question_text=excluded.question_text,option_a=excluded.option_a,option_b=excluded.option_b,option_c=excluded.option_c,option_d=excluded.option_d,correct_answer=excluded.correct_answer,explanation=excluded.explanation,option_explanations=excluded.option_explanations,subject_id=excluded.subject_id,unit_id=excluded.unit_id,topic_id=excluded.topic_id,subtopic_id=excluded.subtopic_id,difficulty=excluded.difficulty,cognitive_level=excluded.cognitive_level,source_type=excluded.source_type,source_year=excluded.source_year,source_document=excluded.source_document,source_url=excluded.source_url,source_page=excluded.source_page,source_question_number=excluded.source_question_number,provenance=coalesce(old.provenance,'{}')||excluded.provenance,exam_program_id=excluded.exam_program_id,lifecycle='STAGED',verification_status='UNVERIFIED',publication_status='DRAFT',verified_by=null,verified_at=null,published_at=null,archived_at=null;
 insert into audit_events(actor_id,action,target_type,target_id) values(auth.uid(),'QUESTION_SAVED','question',qid::text);
 return qid;
end $$;
create function public.transition_question(p_id uuid,p_action text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare q questions;
begin
 perform require_staff(); select * into q from questions where id=p_id for update;
 if not found then raise exception 'Question not found' using errcode='P0002'; end if;
 case p_action
 when 'REVIEW' then
  if q.lifecycle not in ('STAGED','VALIDATION_REQUIRED','EXTRACTED') then raise exception 'Question is not staged'; end if;
  update questions set lifecycle='PENDING_REVIEW' where id=p_id;
 when 'VERIFY' then
  if q.lifecycle<>'PENDING_REVIEW' or q.correct_answer is null or nullif(btrim(q.explanation),'') is null or q.difficulty is null or q.cognitive_level is null then raise exception 'Review, answer, explanation, difficulty and cognitive level are required'; end if;
  if not (q.option_explanations ?& array['A','B','C','D']) or exists(select 1 from jsonb_each_text(q.option_explanations) e where length(btrim(e.value))=0) then raise exception 'An explanation for every option is required'; end if;
  update questions set lifecycle='VERIFIED',verification_status='VERIFIED',verified_by=auth.uid(),verified_at=now() where id=p_id;
 when 'PUBLISH' then
  if q.lifecycle<>'VERIFIED' or q.verification_status<>'VERIFIED' then raise exception 'Only verified questions can be published'; end if;
  update questions set lifecycle='PUBLISHED',publication_status='PUBLISHED',published_at=now() where id=p_id;
 when 'ARCHIVE' then update questions set lifecycle='ARCHIVED',publication_status='ARCHIVED',archived_at=now() where id=p_id;
 else raise exception 'Invalid lifecycle action' using errcode='22023'; end case;
 insert into audit_events(actor_id,action,target_type,target_id) values(auth.uid(),'QUESTION_'||p_action,'question',p_id::text);
end $$;
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.current_role(),public.is_staff(),public.is_admin(),public.require_user(),public.require_staff(),public.has_premium(),public.update_profile(text,numeric,text,uuid),public.set_user_access(uuid,public.app_role,public.entitlement_tier,timestamptz),public.save_question(uuid,jsonb),public.transition_question(uuid,text) to authenticated;
grant execute on function public.current_role(),public.is_staff(),public.is_admin() to anon;
commit;
