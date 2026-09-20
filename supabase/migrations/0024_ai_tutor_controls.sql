-- AI tutor controls are deliberately database-backed so a provider can be
-- disabled instantly without a deployment. Provider credentials remain in env.
create table public.ai_tutor_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  provider text not null default 'openai',
  model text not null default 'not-configured',
  free_daily_limit integer not null default 3 check (free_daily_limit between 0 and 100),
  global_daily_limit integer not null default 100 check (global_daily_limit between 0 and 100000),
  global_monthly_limit integer not null default 1000 check (global_monthly_limit between 0 and 1000000),
  timeout_ms integer not null default 15000 check (timeout_ms between 1000 and 30000),
  max_output_tokens integer not null default 700 check (max_output_tokens between 100 and 2000),
  nepali_enabled boolean not null default true,
  followups_enabled boolean not null default false,
  maintenance_message text not null default 'AI explanation is temporarily unavailable. The verified explanation is still available below.',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

insert into public.ai_tutor_settings(id) values(true) on conflict do nothing;
alter table public.ai_tutor_settings enable row level security;
create policy ai_settings_staff_read on public.ai_tutor_settings for select using(public.is_staff());
create policy ai_settings_admin_update on public.ai_tutor_settings for update using(public.is_admin()) with check(public.is_admin());
grant select,update on public.ai_tutor_settings to authenticated;
grant all on public.ai_tutor_settings to service_role;

create table public.ai_tutor_cache (
  fingerprint text primary key,
  question_id uuid not null references public.questions(id) on delete cascade,
  question_version integer not null default 1,
  action_type text not null,
  selected_answer public.answer_key,
  language text not null default 'en',
  response_text text not null,
  provider text not null,
  model text not null,
  hit_count bigint not null default 0,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);
create index ai_tutor_cache_question_idx on public.ai_tutor_cache(question_id,action_type);
alter table public.ai_tutor_cache enable row level security;
grant all on public.ai_tutor_cache to service_role;

alter table public.ai_usage_logs add column cache_hit boolean not null default false;
alter table public.ai_usage_logs add column question_id uuid references public.questions(id) on delete set null;
alter table public.ai_usage_logs add column action_type text;
create index ai_usage_global_time_idx on public.ai_usage_logs(created_at desc);

create function public.touch_ai_tutor_cache(p_fingerprint text) returns void
language sql security definer set search_path=public,pg_temp as $$
  update ai_tutor_cache set hit_count=hit_count+1,last_used_at=now() where fingerprint=p_fingerprint;
$$;
revoke all on function public.touch_ai_tutor_cache(text) from public,anon,authenticated;
grant execute on function public.touch_ai_tutor_cache(text) to service_role;
