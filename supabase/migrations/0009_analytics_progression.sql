begin;
revoke create on schema public from public,anon,authenticated;
alter table public.profiles add column leaderboard_opt_in boolean not null default false;
create table public.xp_events(id bigint generated always as identity primary key,user_id uuid not null references public.profiles(id),event_key text not null,amount integer not null check(amount>0),reason text not null,created_at timestamptz not null default now(),unique(user_id,event_key));
create index xp_user_idx on public.xp_events(user_id,created_at desc);
create table public.achievement_definitions(code text primary key,name text not null,description text not null);
insert into public.achievement_definitions values('FIRST_TEST','First finish','Complete a test with at least one answer.'),('HUNDRED_ANSWERS','A hundred answers','Answer 100 questions across completed tests.'),('TEN_TESTS','Ten tests','Complete 10 tests with answers.'),('PERFECT_TEST','Perfect score','Answer every question correctly in a test of at least 10 questions.');
create table public.user_achievements(user_id uuid not null references public.profiles(id),code text not null references public.achievement_definitions(code),unlocked_at timestamptz not null default now(),primary key(user_id,code));
create table public.mascot_events(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),kind text not null,payload jsonb not null default '{}',created_at timestamptz not null default now(),seen_at timestamptz);
alter table public.xp_events enable row level security;alter table public.achievement_definitions enable row level security;alter table public.user_achievements enable row level security;alter table public.mascot_events enable row level security;
create policy own on public.xp_events for select using(user_id=auth.uid());
create policy definitions on public.achievement_definitions for select using(true);
create policy own on public.user_achievements for select using(user_id=auth.uid());
create policy own on public.mascot_events for select using(user_id=auth.uid());
grant select on public.xp_events,public.achievement_definitions,public.user_achievements,public.mascot_events to authenticated;
create function public.award_attempt_progress() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare tests integer; answers integer; code text; prior_best numeric;
begin
 if old.status<>'ACTIVE' or new.status not in ('COMPLETED','EXPIRED') or new.correct_count+new.incorrect_count=0 then return new; end if;
 insert into xp_events(user_id,event_key,amount,reason) values(new.user_id,'attempt:'||new.id,10+2*new.correct_count,'Completed test') on conflict do nothing;
 select count(*),sum(correct_count+incorrect_count) into tests,answers from attempts where user_id=new.user_id and status in ('COMPLETED','EXPIRED') and correct_count+incorrect_count>0;
 foreach code in array array['FIRST_TEST',case when answers>=100 then 'HUNDRED_ANSWERS' end,case when tests>=10 then 'TEN_TESTS' end,case when new.correct_count>=10 and new.incorrect_count=0 and new.unanswered_count=0 then 'PERFECT_TEST' end] loop
  if code is not null then
   insert into user_achievements(user_id,code) values(new.user_id,code) on conflict do nothing;
   if found then insert into mascot_events(user_id,kind,payload) values(new.user_id,'ACHIEVEMENT',jsonb_build_object('code',code)); end if;
  end if;
 end loop;
 select max(score/nullif(max_score,0)) into prior_best from attempts where user_id=new.user_id and id<>new.id and mode=new.mode and status in ('COMPLETED','EXPIRED');
 insert into mascot_events(user_id,kind,payload) values(new.user_id,case when prior_best is not null and new.score/nullif(new.max_score,0)>prior_best then 'PERSONAL_BEST' else 'TEST_COMPLETE' end,jsonb_build_object('attempt_id',new.id,'score',new.score));
 return new;
end $$;
create trigger attempt_progress after update of status on public.attempts for each row execute function public.award_attempt_progress();
create function public.get_dashboard() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare uid uuid; result jsonb; dimensions jsonb; trends jsonb; streak integer; tz text;
begin
 uid=require_user();select timezone into tz from profiles where id=uid;
 select jsonb_build_object('tests_completed',count(*),'questions_attempted',coalesce(sum(correct_count+incorrect_count),0),'accuracy',100.0*sum(correct_count)/nullif(sum(correct_count+incorrect_count),0),'average_score',avg(100.0*score/nullif(max_score,0)),'best_score',max(100.0*score/nullif(max_score,0)),'study_seconds',coalesce(sum(least(extract(epoch from completed_at-started_at),extract(epoch from expires_at-started_at))),0)) into result from attempts where user_id=uid and status in ('COMPLETED','EXPIRED');
 with dates as (select distinct (completed_at at time zone tz)::date d from attempts where user_id=uid and status in ('COMPLETED','EXPIRED') and correct_count+incorrect_count>0), ranked as(select d,row_number() over(order by d desc)::integer n,max(d) over() latest from dates)
 select count(*) into streak from ranked where latest>=(now() at time zone tz)::date-1 and d=latest-(n-1);
 with responses as(select q.* from attempt_questions q join attempts a on a.id=q.attempt_id where a.user_id=uid and a.status in ('COMPLETED','EXPIRED')),
 dimensions as(select d.kind,d.value,count(*) filter(where q.selected_answer is not null) answered,count(*) filter(where q.is_correct) correct,count(*) filter(where q.is_correct=false) mistakes,avg(q.response_ms) response_ms from responses q cross join lateral(values ('subject',q.snapshot->>'subject_id'),('topic',coalesce(q.snapshot->>'topic_id',q.snapshot->>'unit_id')),('difficulty',q.snapshot->>'difficulty'),('cognitive',q.snapshot->>'cognitive_level')) d(kind,value) group by d.kind,d.value)
 select coalesce(jsonb_agg(to_jsonb(d)),'[]') into dimensions from dimensions d;
 select coalesce(jsonb_agg(x order by x.completed_at),'[]') into trends from(select id,mode,score,max_score,100.0*score/nullif(max_score,0) percentage,correct_count,incorrect_count,completed_at from attempts where user_id=uid and status in ('COMPLETED','EXPIRED') order by completed_at desc limit 30) x;
 return result||jsonb_build_object('streak',streak,'dimensions',dimensions,'trends',trends,'xp',coalesce((select sum(amount) from xp_events where user_id=uid),0),'target_score',(select target_score from profiles where id=uid),'response_time',coalesce((select jsonb_agg(x) from(select width_bucket(coalesce(q.response_ms,0),0,120000,4) bucket,count(*) count from attempt_questions q join attempts a on a.id=q.attempt_id where a.user_id=uid and a.status in ('COMPLETED','EXPIRED') and q.selected_answer is not null group by 1) x),'[]'));
end $$;
create function public.leaderboard() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 perform require_user();
 return jsonb_build_object('full_access',has_premium(),'entries',coalesce((with totals as(select p.id,p.display_name,coalesce(sum(e.amount),0) xp from profiles p left join xp_events e on e.user_id=p.id where p.leaderboard_opt_in or p.id=auth.uid() group by p.id),ranked as(select id,display_name,xp,dense_rank() over(order by xp desc) rank from totals) select jsonb_agg(x) from(select * from ranked where has_premium() or id=auth.uid() order by rank,display_name limit 100) x),'[]'));
end $$;
create function public.set_leaderboard_privacy(p_opt_in boolean) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin perform require_user();update profiles set leaderboard_opt_in=p_opt_in where id=auth.uid();end $$;
create function public.ack_mascot(p_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin perform require_user();update mascot_events set seen_at=now() where id=p_id and user_id=auth.uid();end $$;
grant execute on function public.get_dashboard(),public.leaderboard(),public.set_leaderboard_privacy(boolean),public.ack_mascot(uuid) to authenticated;
commit;
