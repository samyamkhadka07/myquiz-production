begin;

-- Deleted discussions remain auditable, but never remain actionable or visible as a thread.
create or replace function public.moderate_comment(p_comment uuid,p_action text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare root_id uuid; affected integer := 0;
begin
  perform require_user();
  if p_action='DELETE' then
    select coalesce(parent_id,id) into root_id from comments where id=p_comment;
    if root_id is null then raise exception 'Comment not found' using errcode='P0002'; end if;
    if not is_staff() and not exists(select 1 from comments where id=p_comment and user_id=auth.uid()) then raise exception 'Not authorized' using errcode='42501'; end if;
    if is_staff() then
      update comments set status='DELETED',body='Comment removed',updated_at=now() where (id=root_id or parent_id=root_id) and status<>'DELETED';
    else
      update comments set status='DELETED',body='Comment removed',updated_at=now() where id=p_comment and user_id=auth.uid() and status<>'DELETED';
    end if;
    get diagnostics affected=row_count;
    if affected=0 then raise exception 'Comment not found' using errcode='P0002'; end if;
    if is_staff() then update comment_reports set status='RESOLVED',moderated_by=auth.uid(),resolved_at=now() where status='OPEN' and comment_id in(select id from comments where id=root_id or parent_id=root_id); end if;
  elsif p_action in('HIDE','RESTORE') then
    perform require_staff();update comments set status=case when p_action='HIDE' then 'HIDDEN' else 'VISIBLE' end,updated_at=now() where id=p_comment and status<>'DELETED';
    if not found then raise exception 'Comment not found' using errcode='P0002'; end if;
    update comment_reports set status='RESOLVED',moderated_by=auth.uid(),resolved_at=now() where comment_id=p_comment and status='OPEN';
  else raise exception 'Invalid moderation action'; end if;
  insert into audit_events(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'COMMENT_'||p_action,'comment',coalesce(root_id,p_comment)::text,jsonb_build_object('affected_comments',affected));
end $$;

-- A private manifest supports idempotent archive generation without deleting canonical activity.
create table if not exists public.activity_archives(
 id uuid primary key default gen_random_uuid(),period_start date not null,period_end date not null,categories text[] not null,item_count integer not null check(item_count>=0),object_path text not null unique,generated_at timestamptz not null default now(),generated_by uuid references public.profiles(id),unique(period_start,period_end,categories)
);
alter table public.activity_archives enable row level security;
create policy activity_archives_staff_read on public.activity_archives for select using(public.is_staff());
grant select on public.activity_archives to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('activity-archives','activity-archives',false,10485760,array['application/pdf']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
commit;
