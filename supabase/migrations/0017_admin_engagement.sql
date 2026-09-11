begin;

create table public.learning_game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null check(mode in ('RAPID_FIRE','RAPID_RECALL','MISTAKE_RESCUE','ACCURACY','DAILY_CHALLENGE')),
  status text not null default 'ACTIVE' check(status in ('ACTIVE','COMPLETED','ABANDONED')),
  question_count integer not null check(question_count between 1 and 20),
  correct_count integer not null default 0,
  completed_count integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create table public.learning_game_items (
  session_id uuid not null references public.learning_game_sessions(id) on delete cascade,
  question_id uuid not null references public.questions(id),
  position integer not null,
  snapshot jsonb not null,
  correct_answer public.answer_key not null,
  explanation text not null,
  selected_answer public.answer_key,
  self_rating text check(self_rating in ('KNEW_IT','ALMOST','DIDNT_KNOW')),
  is_correct boolean,
  answered_at timestamptz,
  response_ms integer check(response_ms is null or response_ms>=0),
  primary key(session_id,question_id),
  unique(session_id,position)
);
create table public.study_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_date date not null,
  kind text not null check(kind in ('FLASHCARDS','PRACTICE','MISTAKES','GAME')),
  title text not null,
  target_count integer not null check(target_count>0),
  completed boolean not null default false,
  completed_at timestamptz,
  metadata jsonb not null default '{}',
  unique(user_id,plan_date,kind)
);
create index learning_game_user_idx on public.learning_game_sessions(user_id,started_at desc);
create index study_plan_user_day_idx on public.study_plan_items(user_id,plan_date);

alter table public.learning_game_sessions enable row level security;
alter table public.learning_game_items enable row level security;
alter table public.study_plan_items enable row level security;
create policy own_game_sessions on public.learning_game_sessions for select using(user_id=auth.uid() or public.is_staff());
create policy own_game_items on public.learning_game_items for select using(exists(select 1 from public.learning_game_sessions s where s.id=session_id and (s.user_id=auth.uid() or public.is_staff())));
create policy own_study_plan on public.study_plan_items for select using(user_id=auth.uid() or public.is_staff());
grant select on public.learning_game_sessions,public.study_plan_items to authenticated;

create function public.update_admin_profile(p_name text,p_timezone text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform require_staff();
 if length(btrim(p_name)) not between 1 and 80 or length(btrim(p_timezone)) not between 1 and 100 then raise exception 'Invalid profile preferences' using errcode='22023'; end if;
 update profiles set display_name=btrim(p_name),timezone=btrim(p_timezone),updated_at=now() where id=auth.uid();
 insert into audit_events(actor_id,action,target_type,target_id) values(auth.uid(),'ADMIN_PROFILE_UPDATED','profile',auth.uid()::text);
end $$;

create function public.start_learning_game(p_mode text,p_count integer default 10) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid; sid uuid; chosen integer; result jsonb;
begin
 uid=require_user();
 if p_mode not in ('RAPID_FIRE','RAPID_RECALL','MISTAKE_RESCUE','ACCURACY','DAILY_CHALLENGE') or p_count not between 1 and 20 then raise exception 'Invalid learning game' using errcode='22023'; end if;
 insert into learning_game_sessions(user_id,mode,question_count) values(uid,p_mode,p_count) returning id into sid;
 insert into learning_game_items(session_id,question_id,position,snapshot,correct_answer,explanation)
 select sid,q.id,row_number() over(order by random()),jsonb_build_object('id',q.id,'question_text',q.question_text,'option_a',q.option_a,'option_b',q.option_b,'option_c',q.option_c,'option_d',q.option_d,'subject_id',q.subject_id,'unit_id',q.unit_id,'topic_id',q.topic_id,'difficulty',q.difficulty),q.correct_answer,q.explanation
 from questions q
 where q.lifecycle='PUBLISHED' and q.verification_status='VERIFIED' and q.publication_status='PUBLISHED'
 and (p_mode<>'MISTAKE_RESCUE' or exists(select 1 from attempt_questions aq join attempts a on a.id=aq.attempt_id where aq.question_id=q.id and a.user_id=uid and a.status in ('COMPLETED','EXPIRED') and aq.is_correct=false))
 order by random() limit p_count;
 get diagnostics chosen=row_count;
 if chosen=0 then delete from learning_game_sessions where id=sid;raise exception 'No eligible verified questions are available for this activity';end if;
 update learning_game_sessions set question_count=chosen where id=sid;
 select jsonb_build_object('id',s.id,'mode',s.mode,'question_count',s.question_count,'items',jsonb_agg(jsonb_build_object('question_id',i.question_id,'position',i.position,'snapshot',i.snapshot) order by i.position)) into result from learning_game_sessions s join learning_game_items i on i.session_id=s.id where s.id=sid group by s.id;
 return result;
end $$;

create function public.answer_learning_game(p_session uuid,p_question uuid,p_answer public.answer_key,p_rating text,p_response_ms integer) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid; item learning_game_items; session learning_game_sessions; correct boolean;
begin
 uid=require_user();select * into session from learning_game_sessions where id=p_session and user_id=uid for update;
 if not found or session.status<>'ACTIVE' then raise exception 'Learning session is not active' using errcode='42501';end if;
 select * into item from learning_game_items where session_id=p_session and question_id=p_question for update;
 if not found or item.answered_at is not null then raise exception 'Question is unavailable or already answered' using errcode='22023';end if;
 if p_response_ms is not null and p_response_ms<0 then raise exception 'Invalid response time';end if;
 if p_rating is not null and p_rating not in ('KNEW_IT','ALMOST','DIDNT_KNOW') then raise exception 'Invalid recall rating';end if;
 correct=p_answer=item.correct_answer;
 update learning_game_items set selected_answer=p_answer,self_rating=p_rating,is_correct=correct,response_ms=p_response_ms,answered_at=now() where session_id=p_session and question_id=p_question;
 update learning_game_sessions set completed_count=completed_count+1,correct_count=correct_count+case when correct then 1 else 0 end,status=case when completed_count+1>=question_count then 'COMPLETED' else status end,completed_at=case when completed_count+1>=question_count then now() else completed_at end where id=p_session returning * into session;
 if session.status='COMPLETED' then insert into xp_events(user_id,event_key,amount,reason) values(uid,'game:'||session.id,greatest(2,session.correct_count),'Completed learning game') on conflict do nothing;end if;
 return jsonb_build_object('correct',correct,'correct_answer',item.correct_answer,'explanation',item.explanation,'completed',session.status='COMPLETED','completed_count',session.completed_count,'correct_count',session.correct_count);
end $$;

create function public.set_study_plan_item(p_id uuid,p_completed boolean) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin perform require_user();update study_plan_items set completed=p_completed,completed_at=case when p_completed then now() else null end where id=p_id and user_id=auth.uid();if not found then raise exception 'Plan item not found' using errcode='P0002';end if;end $$;

create function public.get_today_plan() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid; tz text; day date; due_count integer; mistake_count integer; weak_name text; weak_id uuid;
begin
 uid=require_user();select timezone into tz from profiles where id=uid;day=(now() at time zone tz)::date;
 select count(*) into due_count from flashcards where user_id=uid and due<=now();
 select count(*) into mistake_count from attempt_questions aq join attempts a on a.id=aq.attempt_id where a.user_id=uid and a.status in ('COMPLETED','EXPIRED') and aq.is_correct=false;
 select t.id,t.name into weak_id,weak_name from attempt_questions aq join attempts a on a.id=aq.attempt_id join topics t on t.id=(aq.snapshot->>'topic_id')::uuid where a.user_id=uid and a.status in ('COMPLETED','EXPIRED') and aq.selected_answer is not null group by t.id,t.name order by count(*) filter(where aq.is_correct)::numeric/nullif(count(*),0),count(*) desc limit 1;
 insert into study_plan_items(user_id,plan_date,kind,title,target_count,metadata) values
 (uid,day,'FLASHCARDS','Review due flashcards',greatest(1,least(10,due_count)),jsonb_build_object('href','/flashcards','available',due_count)),
 (uid,day,'PRACTICE',case when weak_name is null then 'Build a baseline with practice' else 'Practice '||weak_name end,8,jsonb_build_object('href','/tests','topic_id',weak_id)),
 (uid,day,'MISTAKES','Retry recent mistakes',greatest(1,least(5,mistake_count)),jsonb_build_object('href','/mistakes','available',mistake_count)),
 (uid,day,'GAME','Complete Rapid Recall',1,jsonb_build_object('href','/games'))
 on conflict(user_id,plan_date,kind) do update set title=excluded.title,target_count=excluded.target_count,metadata=excluded.metadata;
 return coalesce((select jsonb_agg(x order by case x.kind when 'FLASHCARDS' then 1 when 'PRACTICE' then 2 when 'MISTAKES' then 3 else 4 end) from study_plan_items x where x.user_id=uid and x.plan_date=day),'[]');
end $$;

grant execute on function public.update_admin_profile(text,text),public.start_learning_game(text,integer),public.answer_learning_game(uuid,uuid,public.answer_key,text,integer),public.set_study_plan_item(uuid,boolean),public.get_today_plan() to authenticated;
grant execute on function public.review_reading(uuid,boolean) to authenticated;
grant all on public.learning_game_sessions,public.learning_game_items,public.study_plan_items to service_role;
commit;
