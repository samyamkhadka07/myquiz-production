begin;

-- Feature resolution is deliberately snapshot-based. A legacy PREMIUM tier is not a wildcard.
create or replace function public.has_entitlement(p_feature text) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select case
  when exists(select 1 from public.entitlement_feature_overrides o where o.user_id=auth.uid() and o.feature=p_feature and o.allowed=false and o.revoked_at is null and o.starts_at<=now() and (o.ends_at is null or o.ends_at>now())) then false
  when exists(select 1 from public.entitlement_feature_overrides o where o.user_id=auth.uid() and o.feature=p_feature and o.allowed=true and o.revoked_at is null and o.starts_at<=now() and (o.ends_at is null or o.ends_at>now())) then true
  when exists(select 1 from public.entitlement_feature_grants g where g.user_id=auth.uid() and g.revoked_at is null and g.starts_at<=now() and g.ends_at>now() and g.features ? p_feature) then true
  when exists(select 1 from public.subscriptions s where s.user_id=auth.uid() and s.status in('ACTIVE','TRIAL','PROMOTIONAL') and s.starts_at<=now() and (s.ends_at is null or s.ends_at>now()) and s.entitlement_snapshot ? p_feature) then true
  else exists(select 1 from public.subscription_plans p where p.code='FREE' and p.enabled and p.archived_at is null and p.features ? p_feature)
 end;
$$;

-- Keep the non-null entitlement start timestamp while clearing paid linkage.
create or replace function public.revoke_subscription(p_subscription uuid,p_reason text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.subscriptions;
begin
 if not public.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Revocation reason is required' using errcode='22023'; end if;
 select * into s from public.subscriptions where id=p_subscription for update;
 if not found then raise exception 'Subscription not found' using errcode='P0002'; end if;
 if s.status='REVOKED' then return; end if;
 if s.status not in('ACTIVE','TRIAL','PROMOTIONAL') then raise exception 'Only active subscriptions can be revoked' using errcode='22023'; end if;
 update public.subscriptions set status='REVOKED',notes=concat_ws(E'\n',notes,'Revoked: '||btrim(p_reason)),updated_at=now() where id=s.id;
 update public.entitlements set tier='FREE',starts_at=coalesce(starts_at,now()),ends_at=null,active_subscription_id=null,updated_at=now() where user_id=s.user_id and active_subscription_id=s.id;
 insert into public.subscription_notifications(user_id,subscription_id,title,message,notification_type,created_by)
 values(s.user_id,s.id,'Subscription revoked','Your subscription access has been revoked. Contact support if you believe this is incorrect.','SUBSCRIPTION_REVOKED',auth.uid()) on conflict do nothing;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'SUBSCRIPTION_REVOKED','subscription',s.id::text,jsonb_build_object('user_id',s.user_id,'reason',btrim(p_reason)));
end $$;

-- Retain billing evidence without retaining an active profile or personal learner state.
create table if not exists public.deleted_account_tombstones(
 user_id uuid primary key,
 deleted_at timestamptz not null default now(),
 deleted_by uuid references public.profiles(id) on delete set null,
 reason text not null default 'Permanent account deletion'
);
alter table public.deleted_account_tombstones enable row level security;
alter table public.subscriptions add column if not exists deleted_user_id uuid;
alter table public.payment_requests add column if not exists deleted_user_id uuid;
alter table public.subscriptions alter column user_id drop not null;
alter table public.payment_requests alter column user_id drop not null;
alter table public.subscriptions drop constraint if exists subscriptions_user_id_fkey;
alter table public.payment_requests drop constraint if exists payment_requests_user_id_fkey;
alter table public.subscriptions add constraint subscriptions_user_id_fkey foreign key(user_id) references public.profiles(id) on delete set null;
alter table public.payment_requests add constraint payment_requests_user_id_fkey foreign key(user_id) references public.profiles(id) on delete set null;
create index if not exists subscriptions_deleted_user_idx on public.subscriptions(deleted_user_id) where deleted_user_id is not null;
create index if not exists payment_requests_deleted_user_idx on public.payment_requests(deleted_user_id) where deleted_user_id is not null;

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
 insert into public.deleted_account_tombstones(user_id,deleted_by) values(target.id,auth.uid()) on conflict(user_id) do nothing;
 update public.payment_requests set deleted_user_id=target.id,user_id=null where user_id=target.id;
 update public.subscriptions set deleted_user_id=target.id,user_id=null where user_id=target.id;
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
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'ACCOUNT_DELETE_PREPARED','deleted_account',target.id::text,jsonb_build_object('billing_retained',true,'anonymized',true));
end $$;
grant execute on function public.revoke_subscription(uuid,text),public.prepare_account_deletion(uuid,text) to authenticated;
commit;
