begin;

-- Only the learner's own row is returned to Free users. Full leaderboard access is
-- resolved by the canonical entitlement function; other rows require an explicit opt-in.
create or replace function public.leaderboard() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  uid uuid := auth.uid();
  full_access boolean;
begin
  perform require_user();
  full_access := has_entitlement('full_leaderboard');
  return jsonb_build_object(
    'full_access', full_access,
    'viewer_id', uid,
    'entries', coalesce((
      with eligible as (
        select p.id,p.display_name,p.target_score,p.timezone
        from profiles p
        where p.leaderboard_opt_in or p.id=uid
      ), metrics as (
        select e.id,e.display_name,e.target_score,
          coalesce(x.xp,0)::integer xp,
          coalesce(a.tests_completed,0)::integer tests_completed,
          coalesce(a.questions_answered,0)::integer questions_answered,
          a.accuracy,a.average_score,a.best_score,
          coalesce(s.streak,0)::integer streak,
          coalesce(t.recent_trend,0)::numeric recent_trend
        from eligible e
        left join lateral (
          select coalesce(sum(amount),0) xp from xp_events where user_id=e.id
        ) x on true
        left join lateral (
          select count(*) filter(where correct_count+incorrect_count>0) tests_completed,
            coalesce(sum(correct_count+incorrect_count),0) questions_answered,
            100.0*sum(correct_count)/nullif(sum(correct_count+incorrect_count),0) accuracy,
            avg(100.0*score/nullif(max_score,0)) average_score,
            max(100.0*score/nullif(max_score,0)) best_score
          from attempts where user_id=e.id and status in ('COMPLETED','EXPIRED')
        ) a on true
        left join lateral (
          with dates as (
            select distinct (completed_at at time zone coalesce(e.timezone,'Asia/Kathmandu'))::date d
            from attempts
            where user_id=e.id and status in ('COMPLETED','EXPIRED') and correct_count+incorrect_count>0
          ), ordered as (
            select d,row_number() over(order by d desc)::integer n from dates
          ) select count(*) streak from ordered where d=current_date-(n-1)
        ) s on true
        left join lateral (
          with scored as (
            select 100.0*score/nullif(max_score,0) percentage,
              row_number() over(order by completed_at desc) n
            from attempts where user_id=e.id and status in ('COMPLETED','EXPIRED') and max_score>0
          ) select coalesce(avg(percentage) filter(where n<=3)-avg(percentage) filter(where n between 4 and 6),0) recent_trend from scored
        ) t on true
      ), ranked as (
        select *,dense_rank() over(order by xp desc,accuracy desc nulls last,display_name) rank from metrics
      ) select jsonb_agg(to_jsonb(row) order by rank,display_name)
      from (
        select * from ranked where full_access or id=uid order by rank,display_name limit 100
      ) row
    ),'[]'::jsonb)
  );
end $$;

grant execute on function public.leaderboard() to authenticated;

commit;
