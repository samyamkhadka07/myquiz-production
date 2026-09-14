begin;
alter table public.profiles add column onboarding_completed_at timestamptz;
alter table public.profiles add column self_assessed_weak_subject_ids uuid[] not null default '{}';
create function public.complete_student_onboarding(p_program uuid,p_target numeric,p_weak_subjects uuid[]) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare focus_subject_id uuid;
begin
 perform require_user();
 if p_program is null or not exists(select 1 from exam_programs where id=p_program) then raise exception 'Choose a valid MEC program' using errcode='22023';end if;
 if p_target is null or p_target<1 or p_target>200 then raise exception 'Choose a target score between 1 and 200' using errcode='22023';end if;
 if cardinality(coalesce(p_weak_subjects,'{}'))>4 then raise exception 'Choose up to four focus subjects' using errcode='22023';end if;
 foreach focus_subject_id in array coalesce(p_weak_subjects,'{}') loop
  if not exists(select 1 from exam_programs p join exam_blueprints b on b.exam_group_id=p.exam_group_id join blueprint_allocations a on a.blueprint_id=b.id where p.id=p_program and a.subject_id=focus_subject_id) then raise exception 'A focus subject is outside the selected program' using errcode='22023';end if;
 end loop;
 update profiles set exam_program_id=p_program,target_score=p_target,self_assessed_weak_subject_ids=coalesce(p_weak_subjects,'{}'),onboarding_completed_at=now(),updated_at=now() where id=auth.uid();
 insert into audit_events(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'STUDENT_ONBOARDING_COMPLETED','profile',auth.uid()::text,jsonb_build_object('program_id',p_program,'focus_subject_count',cardinality(coalesce(p_weak_subjects,'{}'))));
end $$;
grant execute on function public.complete_student_onboarding(uuid,numeric,uuid[]) to authenticated;
commit;
