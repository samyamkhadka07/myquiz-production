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

create table if not exists public.subscription_notifications(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),subscription_id uuid references public.subscriptions(id),title text not null,message text not null,kind text not null check(kind in('EXPIRING','EXPIRED','REVOKED','ADMIN')),created_at timestamptz not null default now(),read_at timestamptz,dismissed_at timestamptz
);
create unique index if not exists subscription_notification_once_idx on public.subscription_notifications(user_id,subscription_id,kind) where dismissed_at is null;
alter table public.subscription_notifications enable row level security;
create policy subscription_notifications_owner_read on public.subscription_notifications for select using(user_id=auth.uid() or public.is_admin());
grant select on public.subscription_notifications to authenticated;
create or replace function public.revoke_subscription(p_subscription uuid,p_reason text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare s subscriptions;
begin
 if not is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Revocation reason is required'; end if;
 select * into s from subscriptions where id=p_subscription for update; if not found then raise exception 'Subscription not found'; end if; if s.status='REVOKED' then return; end if;
 update subscriptions set status='REVOKED',notes=concat_ws(E'\n',notes,'Revoked: '||btrim(p_reason)),updated_at=now() where id=s.id;
 update entitlements set tier='FREE',starts_at=null,ends_at=null,active_subscription_id=null,updated_at=now() where user_id=s.user_id and active_subscription_id=s.id;
 insert into subscription_notifications(user_id,subscription_id,title,message,kind) values(s.user_id,s.id,'Subscription revoked','Your subscription access has been revoked. Contact support if you believe this is incorrect.','REVOKED') on conflict do nothing;
 insert into audit_events(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'SUBSCRIPTION_REVOKED','subscription',s.id::text,jsonb_build_object('reason',btrim(p_reason)));
end $$;
grant execute on function public.revoke_subscription(uuid,text) to authenticated;
commit;
