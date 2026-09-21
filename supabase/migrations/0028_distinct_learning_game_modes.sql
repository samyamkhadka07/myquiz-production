begin;

alter table public.learning_game_sessions
  drop constraint if exists learning_game_sessions_mode_check;
alter table public.learning_game_sessions
  add constraint learning_game_sessions_mode_check
  check(mode in ('RAPID_FIRE','RAPID_RECALL','MEMORY_MATCH','SPEED_CHALLENGE','MISTAKE_RESCUE','ACCURACY','DAILY_CHALLENGE'));

create or replace function public.start_learning_game(p_mode text,p_count integer default 10)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid; sid uuid; chosen integer; result jsonb;
begin
  uid=require_user();
  if p_mode not in ('RAPID_FIRE','RAPID_RECALL','MEMORY_MATCH','SPEED_CHALLENGE','MISTAKE_RESCUE','ACCURACY','DAILY_CHALLENGE') or p_count not between 1 and 20 then
    raise exception 'Invalid learning game' using errcode='22023';
  end if;
  if p_mode in ('MISTAKE_RESCUE','DAILY_CHALLENGE') and not has_entitlement('premium_games') then
    raise exception 'Premium games entitlement required' using errcode='42501';
  end if;
  if p_mode='DAILY_CHALLENGE' and exists(
    select 1 from learning_game_sessions
    where user_id=uid and mode='DAILY_CHALLENGE' and started_at::date=current_date
      and status in ('ACTIVE','COMPLETED')
  ) then
    raise exception 'Today''s Daily Challenge already exists' using errcode='23505';
  end if;
  insert into learning_game_sessions(user_id,mode,question_count)
  values(uid,p_mode,p_count) returning id into sid;
  insert into learning_game_items(session_id,question_id,position,snapshot,correct_answer,explanation)
  select sid,q.id,row_number() over(order by random()),
    jsonb_build_object('id',q.id,'question_text',q.question_text,'option_a',q.option_a,'option_b',q.option_b,'option_c',q.option_c,'option_d',q.option_d,'subject_id',q.subject_id,'unit_id',q.unit_id,'topic_id',q.topic_id,'difficulty',q.difficulty),
    q.correct_answer,q.explanation
  from questions q
  where q.lifecycle='PUBLISHED' and q.verification_status='VERIFIED' and q.publication_status='PUBLISHED'
    and (p_mode<>'MISTAKE_RESCUE' or exists(
      select 1 from attempt_questions aq join attempts a on a.id=aq.attempt_id
      where aq.question_id=q.id and a.user_id=uid and a.status in ('COMPLETED','EXPIRED') and aq.is_correct=false
    ))
  order by random() limit p_count;
  get diagnostics chosen=row_count;
  if chosen=0 then
    delete from learning_game_sessions where id=sid;
    raise exception 'No eligible verified questions are available for this activity';
  end if;
  update learning_game_sessions set question_count=chosen where id=sid;
  select jsonb_build_object('id',s.id,'mode',s.mode,'question_count',s.question_count,
    'items',jsonb_agg(jsonb_build_object('question_id',i.question_id,'position',i.position,'snapshot',i.snapshot) order by i.position))
    into result
  from learning_game_sessions s join learning_game_items i on i.session_id=s.id
  where s.id=sid group by s.id;
  return result;
end $$;

grant execute on function public.start_learning_game(text,integer) to authenticated;
commit;
