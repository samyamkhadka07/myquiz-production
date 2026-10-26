begin;
-- A clearly marked Group I practice fallback. No question's verification or publication flags are altered.
create or replace function public.start_provisional_attempt(
  p_program uuid, p_mode text, p_count integer, p_subject uuid, p_topic uuid, p_request uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $body$
declare
  uid uuid; b public.exam_blueprints; grp text; result uuid; active public.attempts;
  ids uuid[]='{}'; chosen uuid[]; required integer; selected_count integer;
  quota record; is_provisional boolean;
begin
  uid := public.require_user();
  if p_request is null or p_mode not in ('FULL','SUBJECT','TOPIC','IMPORTANT','PAST','ADAPTIVE') or p_count is null or p_count not between 1 and 200 then
    raise exception 'Invalid practice request' using errcode='22023';
  end if;
  perform 1 from public.profiles where id=uid for update;
  select a.id into result from public.attempts a where a.user_id=uid and a.request_key=p_request;
  if found then return result;end if;
  select * into active from public.attempts a where a.user_id=uid and a.status='ACTIVE' for update;
  if found then
    if active.expires_at <= clock_timestamp() then perform public.complete_attempt(active.id);
    else raise exception 'Finish or resume your active attempt' using errcode='22023',detail=active.id::text;end if;
  end if;
  select eb.*,g.code into b,grp from public.exam_blueprints eb
    join public.exam_programs p on p.exam_group_id=eb.exam_group_id
    join public.exam_groups g on g.id=p.exam_group_id
    where p.id=p_program and eb.published and g.active
      and eb.effective_from<=current_date and (eb.effective_to is null or eb.effective_to>=current_date)
    order by eb.version desc limit 1;
  if b.id is null then raise exception 'Published exam blueprint unavailable' using errcode='22023';end if;
  if grp<>'I' then raise exception 'Temporary provisional pool covers Group I only; this program requires its own complete academic question bank' using errcode='22023';end if;
  if p_mode='FULL' then
    if p_subject is not null or p_topic is not null then raise exception 'Full exams cannot have subject/topic filters' using errcode='22023';end if;
    for quota in
      select a.subject_id, s.code as subject_code, sum(a.question_count)::integer as needed
      from public.blueprint_allocations a join public.subjects s on s.id=a.subject_id
      where a.blueprint_id=b.id group by a.subject_id,s.code order by s.code
    loop
      select coalesce(array_agg(z.id),'{}'::uuid[]) into chosen from (
        select q.id from public.questions q where q.subject_id=quota.subject_id
        and (q.exam_program_id is null or q.exam_program_id=p_program)
        and q.correct_answer is not null and nullif(trim(q.explanation),'') is not null
        and (
          (q.lifecycle='PUBLISHED' and q.verification_status='VERIFIED' and q.publication_status='PUBLISHED')
          or
          (q.lifecycle='STAGED' and q.verification_status='UNVERIFIED' and q.publication_status='DRAFT'
           and q.source_type='AI' and q.provenance->>'provisional_practice'='true' and q.provenance->>'exam_group'='I')
        )
        order by case when q.lifecycle='PUBLISHED' then 0 else 1 end,random()
        limit quota.needed
      ) z;
      if cardinality(chosen)<>quota.needed then
        raise exception 'Not enough provisional % questions: need %, available %',quota.subject_code,quota.needed,cardinality(chosen) using errcode='22023';
      end if;
      ids := ids || chosen;
    end loop;
    required := b.question_count;
    if cardinality(ids)<>required then raise exception 'Provisional question allocation is incomplete' using errcode='22023';end if;
  else
    if p_mode='SUBJECT' and p_subject is null or p_mode='TOPIC' and p_topic is null then
      raise exception 'Select the subject or topic' using errcode='22023';end if;
    if p_subject is not null and not exists(
      select 1 from public.blueprint_allocations x where x.blueprint_id=b.id and x.subject_id=p_subject
    ) then raise exception 'Subject outside selected blueprint' using errcode='22023';end if;
    if p_topic is not null and not exists(
      select 1 from public.topics t join public.units u on u.id=t.unit_id
      join public.blueprint_allocations a on a.unit_id=u.id
      where t.id=p_topic and a.blueprint_id=b.id and (p_subject is null or u.subject_id=p_subject)
    ) then raise exception 'Topic outside selected blueprint' using errcode='22023';end if;
    select coalesce(array_agg(z.id),'{}'::uuid[]) into ids from (
      select q.id from public.questions q
      join public.blueprint_allocations a on a.unit_id=q.unit_id and a.blueprint_id=b.id
      where (q.exam_program_id is null or q.exam_program_id=p_program)
      and (p_subject is null or q.subject_id=p_subject)
      and (p_topic is null or q.topic_id=p_topic)
      and q.correct_answer is not null and nullif(trim(q.explanation),'') is not null
      and (p_mode<>'PAST' or (q.source_type='PAST_PAPER' and q.source_year is not null))
      and (
        (q.lifecycle='PUBLISHED' and q.verification_status='VERIFIED' and q.publication_status='PUBLISHED')
        or
        (q.lifecycle='STAGED' and q.verification_status='UNVERIFIED' and q.publication_status='DRAFT'
         and q.source_type='AI' and q.provenance->>'provisional_practice'='true' and q.provenance->>'exam_group'='I')
      )
      order by case when q.lifecycle='PUBLISHED' then 0 else 1 end,random()
      limit least(p_count,100)
    ) z;
    required := cardinality(ids);
    if required=0 then raise exception 'No prepared questions exist in the selected subject or topic' using errcode='22023';end if;
  end if;
  perform 1 from public.questions where id=any(ids) order by id for share;
  select bool_or(q.lifecycle<>'PUBLISHED') into is_provisional from public.questions q where q.id=any(ids);
  if (select count(*) from public.questions q where q.id=any(ids) and q.correct_answer is not null)<>required then
    raise exception 'Question bank changed; retry this test' using errcode='40001';end if;
  insert into public.attempts(user_id,blueprint_id,exam_program_id,mode,request_key,scoring_policy,expires_at)
  values(uid,b.id,p_program,p_mode,p_request,
    jsonb_build_object('correct',b.marks_correct,'incorrect',b.marks_incorrect,'unanswered',b.marks_unanswered,
      'provisional',coalesce(is_provisional,false),'provisional_kind','unverified_practice'),
    clock_timestamp()+make_interval(secs=>case when p_mode='FULL' then b.duration_seconds
      else ceil(b.duration_seconds::numeric*required/b.question_count)::integer end))
  returning id into result;
  insert into public.attempt_questions(attempt_id,question_id,position,snapshot)
  select result,q.id,row_number() over(order by random()),
    jsonb_build_object('id',q.id,'question_text',q.question_text,
      'option_a',q.option_a,'option_b',q.option_b,'option_c',q.option_c,'option_d',q.option_d,
      'subject_id',q.subject_id,'unit_id',q.unit_id,'topic_id',q.topic_id,
      'difficulty',q.difficulty,'cognitive_level',q.cognitive_level)
  from public.questions q where q.id=any(ids);
  insert into public.attempt_question_keys(attempt_id,question_id,correct_answer,explanation,option_explanations,provenance)
  select result,q.id,q.correct_answer,q.explanation,q.option_explanations,
    q.provenance||jsonb_build_object('source_type',q.source_type,'source_document',q.source_document,
      'provisional_answer',q.lifecycle<>'PUBLISHED')
  from public.questions q where q.id=any(ids);
  return result;
end $body$;
revoke all on function public.start_provisional_attempt(uuid,text,integer,uuid,uuid,uuid) from public,anon,authenticated;

-- Keep the normal verified-bank procedure as the first choice.
-- The exception fallback handles only the two known insufficient-bank messages.
create or replace function public.start_attempt(
  p_program uuid,p_mode text,p_count integer,p_subject uuid,p_topic uuid,p_request uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $body$
begin
  perform public.require_user();
  if p_mode='ADAPTIVE' and not public.has_entitlement('adaptive_practice') then
    raise exception 'Adaptive practice entitlement required' using errcode='42501';end if;
  begin
    return public.start_attempt_entitlement_base(p_program,p_mode,p_count,p_subject,p_topic,p_request);
  exception when sqlstate '22023' then
    if sqlerrm not in (
      'Not enough verified questions to satisfy the full unit and cognitive blueprint',
      'Not enough verified questions for this selection; choose fewer questions'
    ) then raise;end if;
    return public.start_provisional_attempt(p_program,p_mode,p_count,p_subject,p_topic,p_request);
  end;
end $body$;
revoke execute on function public.start_attempt(uuid,text,integer,uuid,uuid,uuid) from public,anon;
grant execute on function public.start_attempt(uuid,text,integer,uuid,uuid,uuid) to authenticated;
commit;