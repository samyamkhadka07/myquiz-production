begin;

alter function public.start_attempt(uuid,text,integer,uuid,uuid,uuid) rename to start_attempt_phase1;
revoke execute on function public.start_attempt_phase1(uuid,text,integer,uuid,uuid,uuid) from public,anon,authenticated;

create function public.start_attempt(p_program uuid,p_mode text,p_count integer,p_subject uuid,p_topic uuid,p_request uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare b exam_blueprints;result uuid;prior attempts;ids uuid[];required integer;target numeric;weak_subjects uuid[];
begin
 perform require_user();
 if p_mode='FULL' then return start_attempt_phase1(p_program,p_mode,p_count,p_subject,p_topic,p_request);end if;
 if p_request is null or p_mode not in ('SUBJECT','TOPIC','IMPORTANT','PAST','ADAPTIVE') or p_count not between 1 and 100 then raise exception 'Invalid test request' using errcode='22023';end if;
 perform 1 from profiles where id=auth.uid() for update;
 select id into result from attempts where user_id=auth.uid() and request_key=p_request;if found then return result;end if;
 select * into prior from attempts where user_id=auth.uid() and status='ACTIVE';
 if found then if prior.expires_at<=clock_timestamp() then perform complete_attempt(prior.id);else raise exception 'Finish or resume your active attempt' using errcode='22023',detail=prior.id::text;end if;end if;
 select eb.* into b from exam_blueprints eb join exam_programs p on p.exam_group_id=eb.exam_group_id join exam_groups g on g.id=p.exam_group_id where p.id=p_program and eb.published and g.active and eb.effective_from<=current_date and (eb.effective_to is null or eb.effective_to>=current_date) order by eb.version desc limit 1;
 if not found then raise exception 'Published exam program not found' using errcode='22023';end if;
 if p_mode='SUBJECT' and p_subject is null or p_mode='TOPIC' and p_topic is null then raise exception 'Select the subject or topic' using errcode='22023';end if;
 if p_subject is not null and not exists(select 1 from blueprint_allocations where blueprint_id=b.id and subject_id=p_subject) then raise exception 'Subject outside selected blueprint' using errcode='22023';end if;
 if p_topic is not null and not exists(select 1 from topics t join units u on u.id=t.unit_id join blueprint_allocations ba on ba.unit_id=u.id where t.id=p_topic and ba.blueprint_id=b.id and (p_subject is null or u.subject_id=p_subject)) then raise exception 'Topic outside selected blueprint' using errcode='22023';end if;
 select target_score,self_assessed_weak_subject_ids into target,weak_subjects from profiles where id=auth.uid();required=p_count;
 select array_agg(id) into ids from(
  select q.id from questions q join blueprint_allocations ba on ba.unit_id=q.unit_id and ba.blueprint_id=b.id
  left join lateral(select count(*) seen,count(*) filter(where aq.is_correct=false) mistakes,avg(case when aq.is_correct then 1.0 else 0.0 end) accuracy,max(a.completed_at) last_seen from attempt_questions aq join attempts a on a.id=aq.attempt_id where aq.question_id=q.id and a.user_id=auth.uid() and a.status in ('COMPLETED','EXPIRED')) signal on true
  where q.lifecycle='PUBLISHED' and q.verification_status='VERIFIED' and q.publication_status='PUBLISHED' and (q.exam_program_id is null or q.exam_program_id=p_program)
   and (p_subject is null or q.subject_id=p_subject) and (p_topic is null or q.topic_id=p_topic) and (p_mode<>'PAST' or (q.source_type='PAST_PAPER' and q.source_year is not null))
  order by (coalesce(signal.seen,0)=0) desc,
   case when p_mode='ADAPTIVE' then (1-coalesce(signal.accuracy,0.5))*0.55+least(coalesce(signal.mistakes,0),10)*0.025 else 0 end desc,
   case when p_mode='ADAPTIVE' and ((coalesce(target,140)>=160 and q.difficulty='HARD') or (coalesce(target,140)>=120 and coalesce(target,140)<160 and q.difficulty='MEDIUM') or (coalesce(target,140)<120 and q.difficulty='EASY')) then 1 else 0 end desc,
   case when p_mode='ADAPTIVE' and q.subject_id=any(coalesce(weak_subjects,'{}')) then 1 else 0 end desc,
   case when p_mode='IMPORTANT' then ba.question_count::numeric/b.question_count else 0 end desc,
   signal.last_seen asc nulls first,random() limit required
 ) chosen;
 if coalesce(cardinality(ids),0)<>required then raise exception 'Not enough verified questions for this selection; choose fewer questions' using errcode='22023';end if;
 perform 1 from questions where id=any(ids) order by id for share;
 if (select count(*) from questions where id=any(ids) and lifecycle='PUBLISHED' and verification_status='VERIFIED' and publication_status='PUBLISHED')<>required then raise exception 'Question eligibility changed; retry test creation' using errcode='40001';end if;
 insert into attempts(user_id,blueprint_id,exam_program_id,mode,request_key,scoring_policy,expires_at) values(auth.uid(),b.id,p_program,p_mode,p_request,jsonb_build_object('correct',b.marks_correct,'incorrect',b.marks_incorrect,'unanswered',b.marks_unanswered),clock_timestamp()+make_interval(secs=>ceil(b.duration_seconds::numeric*required/b.question_count)::integer)) returning id into result;
 insert into attempt_questions(attempt_id,question_id,position,snapshot) select result,q.id,row_number() over(order by random()),jsonb_build_object('id',q.id,'question_text',q.question_text,'option_a',q.option_a,'option_b',q.option_b,'option_c',q.option_c,'option_d',q.option_d,'subject_id',q.subject_id,'unit_id',q.unit_id,'topic_id',q.topic_id,'difficulty',q.difficulty,'cognitive_level',q.cognitive_level) from questions q where q.id=any(ids);
 insert into attempt_question_keys(attempt_id,question_id,correct_answer,explanation,option_explanations,provenance) select result,q.id,q.correct_answer,q.explanation,q.option_explanations,q.provenance||jsonb_build_object('source_type',q.source_type,'source_year',q.source_year,'source_document',q.source_document,'source_url',q.source_url,'source_page',q.source_page,'source_question_number',q.source_question_number,'contribution_id',q.contribution_id) from questions q where q.id=any(ids);
 return result;
end $$;

grant execute on function public.start_attempt(uuid,text,integer,uuid,uuid,uuid) to authenticated;

commit;
