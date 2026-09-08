begin;
alter table public.attempts add column request_key uuid;
alter table public.attempts add column exam_program_id uuid references public.exam_programs(id);
alter table public.attempts add column scoring_policy jsonb;
alter table public.attempts add column last_activity_at timestamptz not null default now();
alter table public.attempts add constraint attempt_mode check(mode in ('FULL','SUBJECT','TOPIC','IMPORTANT','PAST','ADAPTIVE'));
create unique index attempt_request_unique on public.attempts(user_id,request_key);
create unique index attempt_one_active on public.attempts(user_id) where status='ACTIVE';
alter table public.attempt_questions add column snapshot jsonb;
alter table public.attempt_questions add column marked_for_review boolean not null default false;
alter table public.attempt_questions add column revision integer not null default 0;
create table public.attempt_question_keys (
 attempt_id uuid not null, question_id uuid not null, correct_answer public.answer_key not null,
 explanation text not null, option_explanations jsonb not null, provenance jsonb not null,
 primary key(attempt_id,question_id), foreign key(attempt_id,question_id) references public.attempt_questions(attempt_id,question_id) on delete cascade
);
alter table public.attempt_question_keys enable row level security;
revoke all on public.attempt_question_keys from anon,authenticated;
create index attempt_questions_question_idx on public.attempt_questions(question_id);
create function public.complete_attempt(p_attempt uuid) returns public.attempts language plpgsql security definer set search_path=public,pg_temp as $$
declare a attempts;
begin
 perform require_user(); select * into a from attempts where id=p_attempt and user_id=auth.uid() for update;
 if not found then raise exception 'Attempt not found' using errcode='P0002'; end if;
 if a.status<>'ACTIVE' then return a; end if;
 update attempt_questions q set
  is_correct=case when q.selected_answer is null then null else q.selected_answer=k.correct_answer end,
  awarded_marks=case when q.selected_answer is null then (a.scoring_policy->>'unanswered')::numeric when q.selected_answer=k.correct_answer then (a.scoring_policy->>'correct')::numeric else (a.scoring_policy->>'incorrect')::numeric end
 from attempt_question_keys k where k.attempt_id=q.attempt_id and k.question_id=q.question_id and q.attempt_id=p_attempt;
 update attempts set status=case when clock_timestamp()>=a.expires_at then 'EXPIRED'::attempt_status else 'COMPLETED'::attempt_status end,
  completed_at=least(clock_timestamp(),a.expires_at),score=t.score,max_score=t.total*(a.scoring_policy->>'correct')::numeric,
  correct_count=t.correct,incorrect_count=t.incorrect,unanswered_count=t.unanswered
 from (select sum(awarded_marks) score,count(*) total,count(*) filter(where is_correct) correct,count(*) filter(where not is_correct) incorrect,count(*) filter(where selected_answer is null) unanswered from attempt_questions where attempt_id=p_attempt) t
 where id=p_attempt returning attempts.* into a;
 return a;
end $$;

create function public.start_attempt(p_program uuid,p_mode text,p_count integer,p_subject uuid,p_topic uuid,p_request uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
 b exam_blueprints; result uuid; prior attempts; ids uuid[]='{}'; alloc_ids uuid[]; counts integer[];
 levels cognitive_level[]=array['RECALL','UNDERSTANDING','APPLICATION']::cognitive_level[];
 n integer; sink integer; cap integer[][]; residual integer[][]; parent integer[]; queue integer[];
 head integer; v integer; w integer; i integer; j integer; flow integer=0; amount integer; available integer; required integer;
begin
 perform require_user();
 if p_request is null or p_mode is null or p_mode not in ('FULL','SUBJECT','TOPIC','IMPORTANT','PAST','ADAPTIVE') or p_count is null or p_count not between 1 and 200 then raise exception 'Invalid test request' using errcode='22023'; end if;
 -- Serialize retries and prevent simultaneous attempts from the same identity.
 perform 1 from profiles where id=auth.uid() for update;
 select id into result from attempts where user_id=auth.uid() and request_key=p_request;
 if found then return result; end if;
 select * into prior from attempts where user_id=auth.uid() and status='ACTIVE';
 if found then
  if prior.expires_at<=clock_timestamp() then perform complete_attempt(prior.id);
  else raise exception 'Finish or resume your active attempt' using errcode='22023',detail=prior.id::text; end if;
 end if;
 select eb.* into b from exam_blueprints eb join exam_programs p on p.exam_group_id=eb.exam_group_id
 join exam_groups g on g.id=p.exam_group_id where p.id=p_program and eb.published and g.active and eb.effective_from<=current_date and (eb.effective_to is null or eb.effective_to>=current_date) order by eb.version desc limit 1;
 if not found then raise exception 'Published exam program not found' using errcode='22023'; end if;
 if p_mode='SUBJECT' and p_subject is null or p_mode='TOPIC' and p_topic is null then raise exception 'Select the subject or topic' using errcode='22023'; end if;
 if p_subject is not null and not exists(select 1 from blueprint_allocations where blueprint_id=b.id and subject_id=p_subject) then raise exception 'Subject outside selected blueprint' using errcode='22023'; end if;
 if p_topic is not null and not exists(select 1 from topics t join units u on u.id=t.unit_id join blueprint_allocations ba on ba.unit_id=u.id where t.id=p_topic and ba.blueprint_id=b.id and (p_subject is null or u.subject_id=p_subject)) then raise exception 'Topic outside selected blueprint' using errcode='22023'; end if;
 if p_mode='FULL' then
  if p_subject is not null or p_topic is not null then raise exception 'Full tests cannot be filtered'; end if;
  select array_agg(unit_id order by unit_id),array_agg(question_count order by unit_id) into alloc_ids,counts from blueprint_allocations where blueprint_id=b.id;
  if (select sum(x) from unnest(counts) x)<>b.question_count then raise exception 'Invalid academic allocation'; end if;
  n=cardinality(alloc_ids); sink=n+5; cap=array_fill(0,array[sink,sink]);
  for i in 1..n loop
   cap[1][i+1]=counts[i];
   for j in 1..3 loop
    select count(*) into available from questions q where q.unit_id=alloc_ids[i] and q.cognitive_level=levels[j] and q.lifecycle='PUBLISHED' and q.verification_status='VERIFIED' and q.publication_status='PUBLISHED' and (q.exam_program_id is null or q.exam_program_id=p_program);
    cap[i+1][n+1+j]=available;
   end loop;
  end loop;
  for j in 1..3 loop
   if b.question_count*(b.cognitive_distribution->>levels[j]::text)::numeric/100 % 1<>0 then raise exception 'Cognitive allocation is not integral'; end if;
   cap[n+1+j][sink]=b.question_count*(b.cognitive_distribution->>levels[j]::text)::integer/100;
  end loop;
  -- Integer max flow satisfies BOTH unit quotas and global cognitive quotas,
  -- including sparse banks for which a greedy allocation can wrongly fail.
  residual=cap;
  loop
   parent=array_fill(0,array[sink]); parent[1]=-1; queue=array[1]; head=1;
   while head<=cardinality(queue) and parent[sink]=0 loop
    v=queue[head]; head=head+1;
    for w in 2..sink loop
     if parent[w]=0 and residual[v][w]>0 then parent[w]=v; queue=array_append(queue,w); end if;
    end loop;
   end loop;
   exit when parent[sink]=0;
   amount=b.question_count; v=sink;
   while v<>1 loop w=parent[v]; amount=least(amount,residual[w][v]); v=w; end loop;
   v=sink;
   while v<>1 loop w=parent[v]; residual[w][v]=residual[w][v]-amount; residual[v][w]=residual[v][w]+amount; v=w; end loop;
   flow=flow+amount;
  end loop;
  if flow<>b.question_count then raise exception 'Not enough verified questions to satisfy the full unit and cognitive blueprint' using errcode='22023'; end if;
  for i in 1..n loop for j in 1..3 loop
   required=cap[i+1][n+1+j]-residual[i+1][n+1+j];
   ids=ids||coalesce((select array_agg(id) from (select q.id from questions q where q.unit_id=alloc_ids[i] and q.cognitive_level=levels[j] and q.lifecycle='PUBLISHED' and q.verification_status='VERIFIED' and q.publication_status='PUBLISHED' and (q.exam_program_id is null or q.exam_program_id=p_program) order by random() limit required) chosen),'{}'::uuid[]);
  end loop; end loop;
  required=b.question_count;
 else
  required=least(p_count,100);
  select array_agg(id) into ids from (
   select q.id from questions q join blueprint_allocations ba on ba.unit_id=q.unit_id and ba.blueprint_id=b.id
   left join lateral (select avg(case when aq.is_correct then 1.0 else 0.0 end) accuracy,count(*) filter(where aq.is_correct=false) mistakes,max(a.completed_at) last_seen
    from attempt_questions aq join attempts a on a.id=aq.attempt_id where a.user_id=auth.uid() and a.status in ('COMPLETED','EXPIRED') and aq.snapshot->>'unit_id'=q.unit_id::text and aq.selected_answer is not null) signal on true
   where q.lifecycle='PUBLISHED' and q.verification_status='VERIFIED' and q.publication_status='PUBLISHED'
   and (q.exam_program_id is null or q.exam_program_id=p_program)
   and (p_subject is null or q.subject_id=p_subject) and (p_topic is null or q.topic_id=p_topic)
   and (p_mode<>'PAST' or (q.source_type='PAST_PAPER' and q.source_year is not null))
   order by case when p_mode='IMPORTANT' then ba.question_count::numeric/b.question_count else 0 end desc,
    case when p_mode='ADAPTIVE' then (1-coalesce(signal.accuracy,0.5))*0.6+least(coalesce(signal.mistakes,0),10)*0.02+
     case when (coalesce(signal.accuracy,0.5)<0.4 and q.difficulty='EASY') or (coalesce(signal.accuracy,0.5) between 0.4 and 0.8 and q.difficulty='MEDIUM') or (coalesce(signal.accuracy,0.5)>0.8 and q.difficulty='HARD') then 0.2 else 0 end else 0 end desc,random()
   limit required
  ) chosen;
  if coalesce(cardinality(ids),0)<>required then raise exception 'Not enough verified questions for this selection; choose fewer questions' using errcode='22023'; end if;
 end if;
 -- Hold row locks through snapshot capture to avoid publication/edit races.
 perform 1 from questions where id=any(ids) order by id for share;
 if (select count(*) from questions where id=any(ids) and lifecycle='PUBLISHED' and verification_status='VERIFIED' and publication_status='PUBLISHED')<>required then raise exception 'Question eligibility changed; retry test creation' using errcode='40001'; end if;
 insert into attempts(user_id,blueprint_id,exam_program_id,mode,request_key,scoring_policy,expires_at)
 values(auth.uid(),b.id,p_program,p_mode,p_request,jsonb_build_object('correct',b.marks_correct,'incorrect',b.marks_incorrect,'unanswered',b.marks_unanswered),clock_timestamp()+make_interval(secs=>case when p_mode='FULL' then b.duration_seconds else ceil(b.duration_seconds::numeric*required/b.question_count)::integer end)) returning id into result;
 insert into attempt_questions(attempt_id,question_id,position,snapshot)
 select result,q.id,row_number() over(order by random()),jsonb_build_object('id',q.id,'question_text',q.question_text,'option_a',q.option_a,'option_b',q.option_b,'option_c',q.option_c,'option_d',q.option_d,'subject_id',q.subject_id,'unit_id',q.unit_id,'topic_id',q.topic_id,'difficulty',q.difficulty,'cognitive_level',q.cognitive_level)
 from questions q where q.id=any(ids);
 insert into attempt_question_keys(attempt_id,question_id,correct_answer,explanation,option_explanations,provenance)
 select result,q.id,q.correct_answer,q.explanation,q.option_explanations,q.provenance||jsonb_build_object('source_type',q.source_type,'source_year',q.source_year,'source_document',q.source_document,'source_url',q.source_url,'source_page',q.source_page,'source_question_number',q.source_question_number,'contribution_id',q.contribution_id) from questions q where q.id=any(ids);
 return result;
end $$;

create function public.save_answer(p_attempt uuid,p_question uuid,p_answer public.answer_key,p_marked boolean,p_revision integer) returns public.attempt_questions language plpgsql security definer set search_path=public,pg_temp as $$
declare a attempts; result attempt_questions;
begin
 perform require_user(); select * into a from attempts where id=p_attempt and user_id=auth.uid() for update;
 if not found then raise exception 'Attempt not found' using errcode='P0002'; end if;
 if a.status<>'ACTIVE' or clock_timestamp()>=a.expires_at then raise exception 'Attempt has ended' using errcode='22023'; end if;
 update attempt_questions set selected_answer=p_answer,marked_for_review=coalesce(p_marked,false),revision=revision+1,answered_at=clock_timestamp(),
 response_ms=coalesce(response_ms,0)+least(300000,greatest(0,floor(extract(epoch from clock_timestamp()-a.last_activity_at)*1000)))::integer
 where attempt_id=p_attempt and question_id=p_question and revision=p_revision returning * into result;
 if not found then raise exception 'Answer changed in another request; refresh and retry' using errcode='40001'; end if;
 update attempts set last_activity_at=clock_timestamp() where id=p_attempt;
 return result;
end $$;
create function public.get_attempt(p_attempt uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a attempts; items jsonb;
begin
 perform require_user(); select * into a from attempts where id=p_attempt and user_id=auth.uid();
 if not found then raise exception 'Attempt not found' using errcode='P0002'; end if;
 if a.status='ACTIVE' and clock_timestamp()>=a.expires_at then a=complete_attempt(p_attempt); end if;
 select jsonb_agg(to_jsonb(q)||case when a.status in ('COMPLETED','EXPIRED') then jsonb_build_object('correct_answer',k.correct_answer,'explanation',k.explanation,'option_explanations',k.option_explanations,'provenance',k.provenance) else '{}'::jsonb end order by q.position) into items
 from attempt_questions q join attempt_question_keys k using(attempt_id,question_id) where q.attempt_id=p_attempt;
 return jsonb_build_object('attempt',to_jsonb(a),'questions',coalesce(items,'[]'),'server_time',clock_timestamp());
end $$;
create function public.set_bookmark(p_question uuid,p_saved boolean) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform require_user();
 if not exists(select 1 from attempt_questions q join attempts a on a.id=q.attempt_id where q.question_id=p_question and a.user_id=auth.uid() and a.status in ('COMPLETED','EXPIRED')) then raise exception 'Review a completed question first' using errcode='42501'; end if;
 if p_saved then insert into bookmarks(user_id,question_id) values(auth.uid(),p_question) on conflict do nothing;
 else delete from bookmarks where user_id=auth.uid() and question_id=p_question; end if;
 return exists(select 1 from bookmarks where user_id=auth.uid() and question_id=p_question);
end $$;
create function public.get_bookmarks() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 perform require_user(); return coalesce((select jsonb_agg(x) from (select b.question_id,b.created_at,q.attempt_id,q.snapshot from bookmarks b join lateral(select aq.attempt_id,aq.snapshot from attempt_questions aq join attempts a on a.id=aq.attempt_id where aq.question_id=b.question_id and a.user_id=auth.uid() and a.status in ('COMPLETED','EXPIRED') order by a.completed_at desc limit 1) q on true where b.user_id=auth.uid() order by b.created_at desc limit 100) x),'[]');
end $$;
create function public.question_availability(p_program uuid) returns table(unit_id uuid,cognitive_level public.cognitive_level,available bigint) language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 perform require_user(); return query select q.unit_id,q.cognitive_level,count(*) from questions q where q.lifecycle='PUBLISHED' and q.verification_status='VERIFIED' and q.publication_status='PUBLISHED' and (q.exam_program_id is null or q.exam_program_id=p_program) and exists(select 1 from exam_programs p join exam_blueprints b on b.exam_group_id=p.exam_group_id join blueprint_allocations a on a.blueprint_id=b.id where p.id=p_program and b.published and a.unit_id=q.unit_id) group by q.unit_id,q.cognitive_level;
end $$;
grant execute on function public.start_attempt(uuid,text,integer,uuid,uuid,uuid),public.save_answer(uuid,uuid,public.answer_key,boolean,integer),public.complete_attempt(uuid),public.get_attempt(uuid),public.set_bookmark(uuid,boolean),public.get_bookmarks(),public.question_availability(uuid) to authenticated;
commit;
