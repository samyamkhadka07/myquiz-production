begin;
create table public.external_sources(
 id uuid primary key default gen_random_uuid(), platform text not null check(platform in ('META')),
 source_type text not null default 'PAGE' check(source_type in ('PAGE')),
 source_identifier text not null, canonical_url text not null, label text not null,
 enabled boolean not null default false, authorization_state text not null default 'UNVERIFIED' check(authorization_state in ('UNVERIFIED','AUTHORIZED','REVOKED','ERROR')),
 cursor text, last_scan_at timestamptz, last_success_at timestamptz, last_error text,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(platform,source_identifier)
);
create table public.ingestion_runs(
 id uuid primary key default gen_random_uuid(), source_id uuid not null references public.external_sources(id) on delete cascade,
 status text not null default 'READY' check(status in ('READY','RUNNING','SUCCEEDED','FAILED','NEEDS_REVIEW')),
 cursor_before text,cursor_after text,discovered_count integer not null default 0,staged_count integer not null default 0,
 error jsonb,started_at timestamptz,completed_at timestamptz,created_at timestamptz not null default now()
);
create table public.external_items(
 id uuid primary key default gen_random_uuid(),source_id uuid not null references public.external_sources(id) on delete cascade,
 run_id uuid references public.ingestion_runs(id),external_id text not null,permalink text,published_at timestamptz,
 media_id text,media_url text,content text,retrieved_at timestamptz not null default now(),fingerprint text not null,
 processing_state text not null default 'STAGED' check(processing_state in ('STAGED','DUPLICATE','PROCESSED','NEEDS_REVIEW','FAILED')),
 provenance jsonb not null default '{}',unique(source_id,external_id),unique(source_id,fingerprint)
);
alter table public.external_sources enable row level security;
alter table public.ingestion_runs enable row level security;
alter table public.external_items enable row level security;
create policy source_staff on public.external_sources for select using(is_staff());
create policy runs_staff on public.ingestion_runs for select using(is_staff());
create policy items_staff on public.external_items for select using(is_staff());
grant select on public.external_sources,public.ingestion_runs,public.external_items to authenticated;
grant all on public.external_sources,public.ingestion_runs,public.external_items to service_role;
create index attempts_user_completed_idx on public.attempts(user_id,completed_at desc) where status in ('COMPLETED','EXPIRED');
create index if not exists attempt_questions_question_idx on public.attempt_questions(question_id);
create index if not exists flashcards_due_idx on public.flashcards(user_id,due);
create index contributions_owner_created_idx on public.contributions(uploader_id,created_at desc);
create index contributions_review_idx on public.contributions(processing_state,review_state,created_at desc);
create index artifacts_contribution_idx on public.processing_artifacts(contribution_id,page_number,chunk_index);
create index staged_contribution_idx on public.staged_items(contribution_id,status,created_at);
create index ingestion_runs_source_idx on public.ingestion_runs(source_id,created_at desc);
create function public.save_external_source(p_id uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare result uuid=coalesce(p_id,gen_random_uuid());
begin
 perform require_user();if not is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if coalesce(p_data->>'platform','')<>'META' or coalesce(p_data->>'source_type','PAGE')<>'PAGE' or coalesce(p_data->>'source_identifier','')='' or coalesce(p_data->>'label','')='' or coalesce(p_data->>'canonical_url','')!~ '^https://(www\.)?facebook\.com/' then raise exception 'Invalid authorized source'; end if;
 insert into external_sources(id,platform,source_type,source_identifier,canonical_url,label,enabled,authorization_state,created_by)
 values(result,'META','PAGE',p_data->>'source_identifier',p_data->>'canonical_url',p_data->>'label',coalesce((p_data->>'enabled')::boolean,false),coalesce(p_data->>'authorization_state','UNVERIFIED'),auth.uid())
 on conflict(id) do update set source_identifier=excluded.source_identifier,canonical_url=excluded.canonical_url,label=excluded.label,enabled=excluded.enabled,authorization_state=excluded.authorization_state,updated_at=now();
 return result;
end $$;
create function public.queue_ingestion(p_source uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare result uuid;
begin
 perform require_staff();
 if not exists(select 1 from external_sources where id=p_source and enabled and authorization_state='AUTHORIZED') then raise exception 'Source is not enabled and authorized'; end if;
 insert into ingestion_runs(source_id,cursor_before) select id,cursor from external_sources where id=p_source returning id into result;
 return result;
end $$;
grant execute on function public.save_external_source(uuid,jsonb),public.queue_ingestion(uuid) to authenticated;
commit;
