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
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),subscription_id uuid references public.subscriptions(id),notification_type text not null check(notification_type in('EXPIRING_7_DAYS','EXPIRING_3_DAYS','EXPIRING_TODAY','EXPIRED','SUBSCRIPTION_REVOKED','ADMIN')),title text not null,message text not null,created_by uuid references public.profiles(id),created_at timestamptz not null default now(),read_at timestamptz,dismissed_at timestamptz
);
create unique index if not exists subscription_notification_once_idx on public.subscription_notifications(user_id,subscription_id,notification_type);
create index if not exists subscription_notifications_user_active_idx on public.subscription_notifications(user_id,created_at desc) where dismissed_at is null;
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
 insert into subscription_notifications(user_id,subscription_id,title,message,notification_type,created_by) values(s.user_id,s.id,'Subscription revoked','Your subscription access has been revoked. Contact support if you believe this is incorrect.','SUBSCRIPTION_REVOKED',auth.uid()) on conflict do nothing;
 insert into audit_events(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'SUBSCRIPTION_REVOKED','subscription',s.id::text,jsonb_build_object('reason',btrim(p_reason)));
end $$;
grant execute on function public.revoke_subscription(uuid,text) to authenticated;
create or replace function public.send_subscription_notification(p_subscription uuid,p_type text,p_message text default null) returns public.subscription_notifications language plpgsql security definer set search_path=public,pg_temp as $$
declare s subscriptions; result subscription_notifications; title_text text; message_text text;
begin
 if not is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 select * into s from subscriptions where id=p_subscription for update; if not found then raise exception 'Subscription not found' using errcode='P0002'; end if;
 if p_type not in('EXPIRING_7_DAYS','EXPIRING_3_DAYS','EXPIRING_TODAY','EXPIRED') then raise exception 'Unsupported notification type'; end if;
 if p_type='EXPIRED' and s.status not in('EXPIRED','ACTIVE','TRIAL','PROMOTIONAL') then raise exception 'Subscription is not eligible'; end if;
 title_text=case p_type when 'EXPIRED' then 'Subscription expired' else 'Subscription renewal reminder' end;
 message_text=coalesce(nullif(btrim(p_message),''),'Your subscription expires on '||coalesce(to_char(s.ends_at at time zone 'Asia/Kathmandu','DD Mon YYYY'),'the configured expiry date')||'. Renew to continue premium access.');
 insert into subscription_notifications(user_id,subscription_id,notification_type,title,message,created_by) values(s.user_id,s.id,p_type,title_text,left(message_text,500),auth.uid()) on conflict(user_id,subscription_id,notification_type) do nothing returning * into result;
 if result.id is null then select * into result from subscription_notifications where user_id=s.user_id and subscription_id=s.id and notification_type=p_type; end if;
 return result;
end $$;
grant execute on function public.send_subscription_notification(uuid,text,text) to authenticated;

-- Account lifecycle is deliberately separate from the application role enum.
alter table public.profiles add column if not exists account_status text not null default 'ACTIVE' check(account_status in('ACTIVE','DEACTIVATED'));
create index if not exists profiles_account_status_idx on public.profiles(account_status);

create or replace function public.require_user() returns uuid language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if exists(select 1 from public.profiles where id=auth.uid() and account_status='DEACTIVATED') then
   raise exception 'Your account has been deactivated. Contact the administrator if you believe this is a mistake.' using errcode='42501';
 end if;
 return auth.uid();
end $$;

create or replace function public.set_account_status(p_user uuid,p_status text,p_reason text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare target public.profiles;
begin
 perform public.require_user();
 if public.current_role()<>'SUPER_ADMIN' then raise exception 'Super Admin approval is required' using errcode='42501'; end if;
 if length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Account lifecycle reason is required' using errcode='22023'; end if;
 select * into target from public.profiles where id=p_user for update;
 if not found then raise exception 'User not found' using errcode='P0002'; end if;
 if target.id=auth.uid() then raise exception 'You cannot change your own Super Admin account' using errcode='42501'; end if;
 if target.role='SUPER_ADMIN' then raise exception 'Protected Super Admin accounts cannot be changed' using errcode='42501'; end if;
 if p_status not in('ACTIVE','DEACTIVATED') then raise exception 'Invalid account status' using errcode='22023'; end if;
 if target.account_status=p_status then return; end if;
 update public.profiles set account_status=p_status,updated_at=now() where id=target.id;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'ACCOUNT_'||p_status,'profile',target.id::text,jsonb_build_object('reason',btrim(p_reason)));
end $$;
grant execute on function public.set_account_status(uuid,text,text) to authenticated;

-- This only prepares an eligible non-billing account for server-side Auth deletion.
-- Billing evidence is intentionally retained by refusing destructive deletion when it exists.
create or replace function public.prepare_account_deletion(p_user uuid,p_confirmation text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare target public.profiles; expected_name text; expected_id text;
begin
 perform public.require_user();
 if public.current_role()<>'SUPER_ADMIN' then raise exception 'Super Admin approval is required' using errcode='42501'; end if;
 select * into target from public.profiles where id=p_user for update;
 if not found then raise exception 'User not found' using errcode='P0002'; end if;
 if target.id=auth.uid() then raise exception 'You cannot delete your own Super Admin account' using errcode='42501'; end if;
 if target.role='SUPER_ADMIN' then raise exception 'Protected Super Admin accounts cannot be deleted' using errcode='42501'; end if;
 expected_name='DELETE '||target.display_name; expected_id='DELETE '||target.id::text;
 if btrim(coalesce(p_confirmation,'')) not in(expected_name,expected_id) then raise exception 'Explicit delete confirmation is required' using errcode='22023'; end if;
 if exists(select 1 from public.payment_requests where user_id=target.id) or exists(select 1 from public.subscriptions where user_id=target.id) then
   raise exception 'Accounts with billing evidence cannot be permanently deleted' using errcode='22023';
 end if;
 -- Delete learner-owned disposable data; retained audit rows are anonymized by clearing actor references.
 delete from public.comment_reports where user_id=target.id;
 delete from public.comment_reactions where user_id=target.id;
 delete from public.comments where user_id=target.id;
 delete from public.flashcard_reviews where user_id=target.id;
 delete from public.flashcards where user_id=target.id;
 delete from public.bookmarks where user_id=target.id;
 delete from public.learning_game_sessions where user_id=target.id;
 delete from public.attempts where user_id=target.id;
 delete from public.xp_events where user_id=target.id;
 delete from public.user_achievements where user_id=target.id;
 delete from public.mascot_events where user_id=target.id;
 delete from public.ai_usage_logs where user_id=target.id;
 delete from public.subscription_notifications where user_id=target.id or created_by=target.id;
 update public.audit_events set actor_id=null,metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('anonymized_actor',true) where actor_id=target.id;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'ACCOUNT_DELETE_PREPARED','profile',target.id::text,jsonb_build_object('anonymized',true));
end $$;
grant execute on function public.prepare_account_deletion(uuid,text) to authenticated;
commit;
