begin;

create table public.admin_role_requests (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique references public.profiles(id) on delete cascade,
 status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED')),
 requested_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid references public.profiles(id) on delete set null,
 decision_note text check(decision_note is null or length(decision_note)<=1000),
 check((status='PENDING' and reviewed_at is null and reviewed_by is null) or (status<>'PENDING' and reviewed_at is not null and reviewed_by is not null))
);
create index admin_role_requests_status_requested_idx on public.admin_role_requests(status,requested_at desc);

alter table public.admin_role_requests enable row level security;
revoke all on public.admin_role_requests from anon,authenticated;
grant select on public.admin_role_requests to authenticated;

create or replace function public.is_super_admin() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.current_role()='SUPER_ADMIN'
$$;

create policy admin_request_own_or_super_read on public.admin_role_requests for select to authenticated
 using(user_id=auth.uid() or public.is_super_admin());

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into profiles(id,display_name,role) values(new.id,left(coalesce(nullif(btrim(new.raw_user_meta_data->>'display_name'),''),nullif(split_part(new.email,'@',1),''),'Student'),80),'STUDENT') on conflict(id) do nothing;
 insert into entitlements(user_id) values(new.id) on conflict(user_id) do nothing;
 if upper(coalesce(new.raw_user_meta_data->>'requested_account_type','STUDENT'))='ADMIN' then
  insert into admin_role_requests(user_id) values(new.id) on conflict(user_id) do nothing;
 end if;
 return new;
end $$;

create or replace function public.review_admin_request(p_request uuid,p_decision text,p_note text default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare request_row admin_role_requests;
begin
 perform require_user();
 if not is_super_admin() then raise exception 'Super Admin approval required' using errcode='42501'; end if;
 if p_decision not in ('APPROVE','REJECT') then raise exception 'Invalid decision' using errcode='22023'; end if;
 select * into request_row from admin_role_requests where id=p_request for update;
 if not found then raise exception 'Admin request not found' using errcode='P0002'; end if;
 if request_row.status<>'PENDING' then raise exception 'Admin request was already reviewed' using errcode='22023'; end if;
 update admin_role_requests set status=case when p_decision='APPROVE' then 'APPROVED' else 'REJECTED' end,reviewed_at=now(),reviewed_by=auth.uid(),decision_note=nullif(btrim(p_note),'') where id=p_request;
 if p_decision='APPROVE' then update profiles set role='ADMIN',updated_at=now() where id=request_row.user_id and role='STUDENT'; end if;
 insert into audit_events(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'ADMIN_REQUEST_'||p_decision,'admin_role_request',p_request::text,jsonb_build_object('user_id',request_row.user_id));
end $$;

create or replace function public.set_user_access(p_user uuid,p_role public.app_role,p_tier public.entitlement_tier,p_ends timestamptz default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform require_user();
 if not is_super_admin() or p_role='SUPER_ADMIN' then raise exception 'Super Admin access required' using errcode='42501'; end if;
 if p_user=auth.uid() then raise exception 'Self role changes are not allowed' using errcode='42501'; end if;
 update profiles set role=p_role,updated_at=now() where id=p_user and role<>'SUPER_ADMIN';
 if not found then raise exception 'User not found or protected' using errcode='P0002'; end if;
 insert into entitlements(user_id,tier,starts_at,ends_at,granted_by) values(p_user,p_tier,now(),p_ends,auth.uid()) on conflict(user_id) do update set tier=excluded.tier,starts_at=excluded.starts_at,ends_at=excluded.ends_at,granted_by=auth.uid(),updated_at=now();
 insert into audit_events(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'USER_ACCESS_UPDATED','profile',p_user::text,jsonb_build_object('role',p_role,'tier',p_tier));
end $$;

revoke execute on function public.is_super_admin(),public.review_admin_request(uuid,text,text) from public,anon,authenticated;
grant execute on function public.is_super_admin(),public.review_admin_request(uuid,text,text) to authenticated;
grant execute on function public.is_super_admin() to anon;

commit;
