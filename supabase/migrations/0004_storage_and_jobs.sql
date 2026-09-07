begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('contributions','contributions',false,null,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','text/csv','image/png','image/jpeg'])
on conflict(id) do update set public=false, file_size_limit=null, allowed_mime_types=excluded.allowed_mime_types;
create policy contribution_object_insert on storage.objects for insert to authenticated
with check(bucket_id='contributions' and (storage.foldername(name))[1]='contributions' and (storage.foldername(name))[2]=auth.uid()::text);
create policy contribution_object_owner_read on storage.objects for select to authenticated
using(bucket_id='contributions' and owner_id=auth.uid()::text);
create policy contribution_object_owner_update on storage.objects for update to authenticated
using(bucket_id='contributions' and owner_id=auth.uid()::text)
with check(bucket_id='contributions' and owner_id=auth.uid()::text);

create table public.processing_jobs(
 id uuid primary key default gen_random_uuid(), kind text not null, contribution_id uuid references public.contributions(id),
 status text not null default 'READY' check(status in('READY','RUNNING','RETRY','SUCCEEDED','FAILED','DEAD_LETTER')),
 idempotency_key text not null unique, cursor jsonb not null default '{}'::jsonb, input jsonb not null default '{}'::jsonb,
 attempt_count integer not null default 0 check(attempt_count>=0), max_attempts integer not null default 5 check(max_attempts between 1 and 20),
 available_at timestamptz not null default now(), locked_at timestamptz, locked_by text, last_error jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz
);
create index processing_jobs_claim_idx on public.processing_jobs(status,available_at) where status in('READY','RETRY');
create table public.processing_artifacts(
 id uuid primary key default gen_random_uuid(), job_id uuid not null references public.processing_jobs(id) on delete cascade,
 contribution_id uuid not null references public.contributions(id), page_number integer, chunk_index integer,
 artifact_type text not null, content text, data jsonb not null default '{}'::jsonb, checksum text,
 created_at timestamptz not null default now(), unique(job_id,page_number,chunk_index,artifact_type)
);
create table public.audit_events(
 id bigint generated always as identity primary key, actor_id uuid references public.profiles(id), action text not null,
 target_type text not null, target_id text not null, request_id text, metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
alter table public.processing_jobs enable row level security; alter table public.processing_artifacts enable row level security; alter table public.audit_events enable row level security;
create policy processing_staff_read on public.processing_jobs for select using(public.is_staff());
create policy artifacts_staff_read on public.processing_artifacts for select using(public.is_staff());
create policy audit_admin_read on public.audit_events for select using(public.is_admin());
commit;
