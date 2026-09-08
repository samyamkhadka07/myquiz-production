begin;
alter table public.processing_jobs add column workflow_run_id text;
create table public.ai_usage_logs(id uuid primary key default gen_random_uuid(),user_id uuid references public.profiles(id),purpose text not null,provider text not null,model text not null,input_tokens integer not null default 0,output_tokens integer not null default 0,estimated_cost numeric,latency_ms integer not null,status text not null check(status in ('SUCCEEDED','FAILED')),error_code text,created_at timestamptz not null default now());
create index ai_usage_user_time_idx on public.ai_usage_logs(user_id,created_at desc);
alter table public.ai_usage_logs enable row level security;
create policy own_or_staff on public.ai_usage_logs for select using(user_id=auth.uid() or is_staff());
grant select on public.ai_usage_logs to authenticated;grant all on public.ai_usage_logs to service_role;
create function public.commit_document_step(p_job uuid,p_lease uuid,p_cursor jsonb,p_status text,p_artifacts jsonb,p_staged jsonb,p_reading jsonb,p_updates jsonb) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare job processing_jobs;item jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server worker required' using errcode='42501'; end if;
 select * into job from processing_jobs where id=p_job and lease_token=p_lease and status='RUNNING' and lease_until>now() for update;
 if not found then return false; end if;
 for item in select * from jsonb_array_elements(p_artifacts) loop
  insert into processing_artifacts(job_id,contribution_id,page_number,chunk_index,artifact_type,content,data) values(job.id,job.contribution_id,(item->>'page')::integer,(item->>'chunk')::integer,item->>'type',item->>'content',coalesce(item->'data','{}')) on conflict(job_id,page_number,chunk_index,artifact_type) do nothing;
 end loop;
 for item in select * from jsonb_array_elements(p_staged) loop
  insert into staged_items(contribution_id,job_id,source_key,source_page,source_row,question_data,validation_errors,duplicate_question_id,status)
  values(job.contribution_id,job.id,item->>'key',(item->>'page')::integer,(item->>'row')::integer,item->'data',item->'errors',(item->>'duplicate')::uuid,case when item->>'duplicate' is null then 'PENDING_REVIEW' else 'DUPLICATE' end) on conflict(source_key) do nothing;
 end loop;
 for item in select * from jsonb_array_elements(p_reading) loop
  insert into reading_chunks(contribution_id,page_number,chunk_index,content,title) values(job.contribution_id,(item->>'page')::integer,(item->>'chunk')::integer,item->>'content',item->>'title') on conflict(contribution_id,page_number,chunk_index) do nothing;
 end loop;
 update contributions set checksum_sha256=coalesce(p_updates->>'checksum',checksum_sha256),processing_state=coalesce(p_updates->>'state',processing_state),error_code=p_updates->>'error_code',error_detail=p_updates->>'error_detail' where id=job.contribution_id;
 return checkpoint_job(p_job,p_lease,p_cursor,p_status,null);
end $$;
create function public.claim_document_job(p_id uuid,p_worker text) returns public.processing_jobs language plpgsql security definer set search_path=public,pg_temp as $$
declare job processing_jobs;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server worker required' using errcode='42501'; end if;
 update processing_jobs set status='DEAD_LETTER',last_error='{"code":"LEASE_EXHAUSTED","message":"Worker leases expired repeatedly; original and partial results retained."}',completed_at=now() where id=p_id and status='RUNNING' and lease_until<now() and step_attempts>=max_attempts;
 select * into job from processing_jobs where id=p_id and ((status in ('READY','RETRY') and available_at<=now()) or (status='RUNNING' and lease_until<now())) and step_attempts<max_attempts for update skip locked;
 if not found then return null; end if;
 update processing_jobs set status='RUNNING',locked_by=p_worker,locked_at=now(),lease_until=now()+interval '90 seconds',lease_token=gen_random_uuid(),attempt_count=attempt_count+1,step_attempts=step_attempts+1,updated_at=now() where id=p_id returning * into job;
 return job;
end $$;
grant execute on function public.commit_document_step(uuid,uuid,jsonb,text,jsonb,jsonb,jsonb,jsonb),public.claim_document_job(uuid,text) to service_role;
commit;
