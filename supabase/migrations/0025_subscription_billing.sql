begin;

create table public.subscription_plans(
 id uuid primary key default gen_random_uuid(),code text not null unique check(code~'^[A-Z0-9_]+$'),name text not null,description text not null default '',
 price_npr numeric(10,2) not null check(price_npr>=0),duration_days integer check(duration_days is null or duration_days between 1 and 3660),
 features jsonb not null default '[]'::jsonb check(jsonb_typeof(features)='array'),ai_daily_limit integer not null default 0 check(ai_daily_limit between 0 and 1000),
 marketing_text text not null default '',display_order integer not null default 0,recommended boolean not null default false,enabled boolean not null default true,
 archived_at timestamptz,version integer not null default 1 check(version>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by uuid references public.profiles(id),updated_by uuid references public.profiles(id)
);
create table public.subscription_plan_versions(
 id uuid primary key default gen_random_uuid(),plan_id uuid not null references public.subscription_plans(id),version integer not null,snapshot jsonb not null,
 changed_by uuid references public.profiles(id),created_at timestamptz not null default now(),unique(plan_id,version)
);
create table public.subscriptions(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),plan_id uuid not null references public.subscription_plans(id),
 plan_version integer not null,plan_snapshot jsonb not null,entitlement_snapshot jsonb not null check(jsonb_typeof(entitlement_snapshot)='array'),
 status text not null check(status in('ACTIVE','EXPIRED','REVOKED','CANCELLED','TRIAL','PROMOTIONAL')),starts_at timestamptz not null,ends_at timestamptz,
 source text not null check(source in('MANUAL_PAYMENT','ADMIN_GRANT','TRIAL','PROMO')),notes text,created_by uuid references public.profiles(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index subscriptions_one_current_idx on public.subscriptions(user_id) where status in('ACTIVE','TRIAL','PROMOTIONAL');
create index subscriptions_user_time_idx on public.subscriptions(user_id,created_at desc);

create table public.payment_methods(
 id uuid primary key default gen_random_uuid(),code text not null unique check(code~'^[A-Z0-9_]+$'),name text not null,enabled boolean not null default false,
 qr_object_path text,display_name text,instructions text,account_identifier text,verification_instructions text,display_order integer not null default 0,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),updated_by uuid references public.profiles(id)
);
create table public.payment_requests(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),plan_id uuid not null references public.subscription_plans(id),
 plan_version integer not null,plan_snapshot jsonb not null,payment_method_id uuid not null references public.payment_methods(id),amount_npr numeric(10,2) not null check(amount_npr>0),
 reference_id text not null check(length(trim(reference_id)) between 3 and 120),receipt_object_path text,note text,status text not null default 'PENDING' check(status in('PENDING','CLARIFICATION_REQUESTED','APPROVED','REJECTED','EXPIRED','CANCELLED')),
 admin_note text,reviewed_by uuid references public.profiles(id),reviewed_at timestamptz,subscription_id uuid references public.subscriptions(id),submitted_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index payment_reference_unique_idx on public.payment_requests(payment_method_id,lower(reference_id));
create index payment_requests_user_time_idx on public.payment_requests(user_id,submitted_at desc);
create index payment_requests_queue_idx on public.payment_requests(status,submitted_at);

alter table public.entitlements add column active_subscription_id uuid references public.subscriptions(id);

alter table public.subscription_plans enable row level security;
alter table public.subscription_plan_versions enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payment_methods enable row level security;
alter table public.payment_requests enable row level security;
create policy plans_public_read on public.subscription_plans for select to anon,authenticated using(enabled and archived_at is null or public.is_admin());
create policy plan_versions_admin_read on public.subscription_plan_versions for select to authenticated using(public.is_admin());
create policy subscriptions_owner_read on public.subscriptions for select to authenticated using(user_id=auth.uid() or public.is_admin());
create policy payment_methods_enabled_read on public.payment_methods for select to authenticated using(enabled or public.is_admin());
create policy payment_requests_owner_read on public.payment_requests for select to authenticated using(user_id=auth.uid() or public.is_admin());

grant select on public.subscription_plans to anon,authenticated;
grant select on public.subscription_plan_versions,public.subscriptions,public.payment_methods,public.payment_requests to authenticated;
grant all on public.subscription_plans,public.subscription_plan_versions,public.subscriptions,public.payment_methods,public.payment_requests to service_role;

insert into public.subscription_plans(code,name,description,price_npr,duration_days,features,ai_daily_limit,marketing_text,display_order,recommended) values
('FREE','Free','Start CEE preparation with core verified learning tools.',0,null,'["limited_question_bank","limited_daily_practice","sample_tests","bookmarks","basic_history","basic_dashboard","mistake_center","flashcards","limited_leaderboard","sample_reading_materials","ai_tutor"]',3,'Core practice with no payment required.',10,false),
('CEE_PRACTICE','CEE Practice','Build consistent chapter and subject practice.',499,30,'["question_bank_full","chapter_practice","subject_practice","custom_tests","pyq_access","mistake_center","bookmarks","flashcards","premium_games","model_sets","basic_analytics","ai_tutor"]',10,'Full verified practice for focused preparation.',20,false),
('CEE_PRO','CEE Pro','Add full mocks, adaptive priorities and advanced analytics.',999,30,'["question_bank_full","chapter_practice","subject_practice","custom_tests","pyq_access","mistake_center","bookmarks","flashcards","premium_games","model_sets","advanced_analytics","full_mock","adaptive_practice","target_score_engine","weak_topic_rescue","full_leaderboard","reading_materials","ai_tutor"]',25,'Complete CEE preparation and performance guidance.',30,true),
('CEE_AI_COACH','CEE AI Coach','Higher tutor limits and bilingual concept support.',1499,30,'["question_bank_full","chapter_practice","subject_practice","custom_tests","pyq_access","mistake_center","bookmarks","flashcards","premium_games","model_sets","advanced_analytics","full_mock","adaptive_practice","target_score_engine","weak_topic_rescue","full_leaderboard","reading_materials","ai_tutor","ai_followups","ai_nepali","ai_mnemonics"]',60,'Pro preparation with expanded question-scoped AI tutoring.',40,false)
on conflict(code) do nothing;

insert into public.payment_methods(code,name,display_order) values
('ESEWA','eSewa',10),('KHALTI','Khalti',20),('MOBILE_BANKING','Mobile Banking',30),('CITYPAY','CityPay',40),('MYPAY','MyPay',50)
on conflict(code) do nothing;

create function public.save_subscription_plan(p_id uuid,p_data jsonb) returns public.subscription_plans language plpgsql security definer set search_path=public,pg_temp as $$
declare old subscription_plans;result subscription_plans;next_version integer;
begin
 if not is_admin() then raise exception 'Admin access required' using errcode='42501';end if;
 if p_id is null then
  insert into subscription_plans(code,name,description,price_npr,duration_days,features,ai_daily_limit,marketing_text,display_order,recommended,enabled,created_by,updated_by)
  values(upper(trim(p_data->>'code')),trim(p_data->>'name'),coalesce(trim(p_data->>'description'),''),(p_data->>'price_npr')::numeric,(p_data->>'duration_days')::integer,coalesce(p_data->'features','[]'),coalesce((p_data->>'ai_daily_limit')::integer,0),coalesce(trim(p_data->>'marketing_text'),''),coalesce((p_data->>'display_order')::integer,0),coalesce((p_data->>'recommended')::boolean,false),coalesce((p_data->>'enabled')::boolean,true),auth.uid(),auth.uid()) returning * into result;
 else
  select * into old from subscription_plans where id=p_id for update;if not found then raise exception 'Plan not found' using errcode='P0002';end if;
  insert into subscription_plan_versions(plan_id,version,snapshot,changed_by) values(old.id,old.version,to_jsonb(old),auth.uid());next_version=old.version+1;
  update subscription_plans set name=trim(p_data->>'name'),description=coalesce(trim(p_data->>'description'),''),price_npr=(p_data->>'price_npr')::numeric,duration_days=(p_data->>'duration_days')::integer,features=coalesce(p_data->'features','[]'),ai_daily_limit=coalesce((p_data->>'ai_daily_limit')::integer,0),marketing_text=coalesce(trim(p_data->>'marketing_text'),''),display_order=coalesce((p_data->>'display_order')::integer,0),recommended=coalesce((p_data->>'recommended')::boolean,false),enabled=coalesce((p_data->>'enabled')::boolean,true),version=next_version,updated_at=now(),updated_by=auth.uid() where id=p_id returning * into result;
 end if;
 insert into audit_events(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'SUBSCRIPTION_PLAN_SAVED','subscription_plan',result.id::text,jsonb_build_object('version',result.version));return result;
end $$;

create function public.submit_payment_request(p_plan uuid,p_method uuid,p_reference text,p_note text default null) returns public.payment_requests language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid;plan subscription_plans;method payment_methods;result payment_requests;
begin
 uid=require_user();select * into plan from subscription_plans where id=p_plan and enabled and archived_at is null and price_npr>0;if not found then raise exception 'Paid plan is unavailable' using errcode='P0002';end if;
 select * into method from payment_methods where id=p_method and enabled;if not found then raise exception 'Payment method is unavailable' using errcode='P0002';end if;
 insert into payment_requests(user_id,plan_id,plan_version,plan_snapshot,payment_method_id,amount_npr,reference_id,note)
 values(uid,plan.id,plan.version,to_jsonb(plan),method.id,plan.price_npr,trim(p_reference),nullif(trim(p_note),'')) returning * into result;
 insert into audit_events(actor_id,action,target_type,target_id) values(uid,'PAYMENT_REQUEST_SUBMITTED','payment_request',result.id::text);return result;
end $$;

create function public.save_payment_method(p_id uuid,p_data jsonb) returns public.payment_methods language plpgsql security definer set search_path=public,pg_temp as $$
declare result payment_methods;
begin
 if not is_admin() then raise exception 'Admin access required' using errcode='42501';end if;
 if p_id is null then
  insert into payment_methods(code,name,enabled,qr_object_path,display_name,instructions,account_identifier,verification_instructions,display_order,updated_by)
  values(upper(trim(p_data->>'code')),trim(p_data->>'name'),coalesce((p_data->>'enabled')::boolean,false),nullif(trim(p_data->>'qr_object_path'),''),nullif(trim(p_data->>'display_name'),''),nullif(trim(p_data->>'instructions'),''),nullif(trim(p_data->>'account_identifier'),''),nullif(trim(p_data->>'verification_instructions'),''),coalesce((p_data->>'display_order')::integer,0),auth.uid()) returning * into result;
 else
  update payment_methods set name=trim(p_data->>'name'),enabled=coalesce((p_data->>'enabled')::boolean,false),qr_object_path=nullif(trim(p_data->>'qr_object_path'),''),display_name=nullif(trim(p_data->>'display_name'),''),instructions=nullif(trim(p_data->>'instructions'),''),account_identifier=nullif(trim(p_data->>'account_identifier'),''),verification_instructions=nullif(trim(p_data->>'verification_instructions'),''),display_order=coalesce((p_data->>'display_order')::integer,0),updated_at=now(),updated_by=auth.uid() where id=p_id returning * into result;
  if not found then raise exception 'Payment method not found' using errcode='P0002';end if;
 end if;
 insert into audit_events(actor_id,action,target_type,target_id) values(auth.uid(),'PAYMENT_METHOD_SAVED','payment_method',result.id::text);return result;
end $$;

create function public.review_payment_request(p_request uuid,p_action text,p_note text default null) returns public.payment_requests language plpgsql security definer set search_path=public,pg_temp as $$
declare payment payment_requests;subscription subscriptions;duration integer;
begin
 if not is_admin() then raise exception 'Admin access required' using errcode='42501';end if;select * into payment from payment_requests where id=p_request for update;if not found then raise exception 'Payment request not found' using errcode='P0002';end if;
 if payment.status not in('PENDING','CLARIFICATION_REQUESTED') then raise exception 'Payment request was already finalized' using errcode='40001';end if;
 if p_action='APPROVE' then
  if exists(select 1 from subscriptions where user_id=payment.user_id and status in('ACTIVE','TRIAL','PROMOTIONAL')) then update subscriptions set status='REVOKED',updated_at=now(),notes=concat_ws(E'\n',notes,'Replaced by approved payment '||payment.id) where user_id=payment.user_id and status in('ACTIVE','TRIAL','PROMOTIONAL');end if;
  duration=coalesce((payment.plan_snapshot->>'duration_days')::integer,30);
  insert into subscriptions(user_id,plan_id,plan_version,plan_snapshot,entitlement_snapshot,status,starts_at,ends_at,source,notes,created_by)
  values(payment.user_id,payment.plan_id,payment.plan_version,payment.plan_snapshot,coalesce(payment.plan_snapshot->'features','[]'),'ACTIVE',now(),now()+make_interval(days=>duration),'MANUAL_PAYMENT',nullif(trim(p_note),''),auth.uid()) returning * into subscription;
  update payment_requests set status='APPROVED',admin_note=nullif(trim(p_note),''),reviewed_by=auth.uid(),reviewed_at=now(),subscription_id=subscription.id,updated_at=now() where id=payment.id returning * into payment;
  insert into entitlements(user_id,tier,starts_at,ends_at,granted_by,active_subscription_id) values(payment.user_id,'PREMIUM',subscription.starts_at,subscription.ends_at,auth.uid(),subscription.id) on conflict(user_id) do update set tier='PREMIUM',starts_at=excluded.starts_at,ends_at=excluded.ends_at,granted_by=auth.uid(),active_subscription_id=subscription.id,updated_at=now();
 elsif p_action in('REJECT','REQUEST_CLARIFICATION') then
  update payment_requests set status=case when p_action='REJECT' then 'REJECTED' else 'CLARIFICATION_REQUESTED' end,admin_note=nullif(trim(p_note),''),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=payment.id returning * into payment;
 else raise exception 'Unsupported payment action' using errcode='22023';end if;
 insert into audit_events(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'PAYMENT_'||p_action,'payment_request',payment.id::text,jsonb_build_object('subscription_id',payment.subscription_id));return payment;
end $$;

create function public.has_entitlement(p_feature text) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from subscriptions s where s.user_id=auth.uid() and s.status in('ACTIVE','TRIAL','PROMOTIONAL') and s.starts_at<=now() and (s.ends_at is null or s.ends_at>now()) and s.entitlement_snapshot ? p_feature)
 or exists(select 1 from subscription_plans p where p.code='FREE' and p.enabled and p.archived_at is null and p.features ? p_feature);
$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('payment-receipts','payment-receipts',false,5242880,array['image/png','image/jpeg','image/webp','application/pdf']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('payment-assets','payment-assets',false,5242880,array['image/png','image/jpeg','image/webp']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy payment_receipt_owner_insert on storage.objects for insert to authenticated with check(bucket_id='payment-receipts' and (storage.foldername(name))[1]=auth.uid()::text);
create policy payment_receipt_owner_read on storage.objects for select to authenticated using(bucket_id='payment-receipts' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));
create policy payment_asset_admin_insert on storage.objects for insert to authenticated with check(bucket_id='payment-assets' and public.is_admin());
create policy payment_asset_configured_read on storage.objects for select to authenticated using(bucket_id='payment-assets' and exists(select 1 from public.payment_methods m where m.enabled and m.qr_object_path=name));

grant execute on function public.save_subscription_plan(uuid,jsonb),public.save_payment_method(uuid,jsonb),public.review_payment_request(uuid,text,text) to authenticated;
grant execute on function public.submit_payment_request(uuid,uuid,text,text),public.has_entitlement(text) to authenticated;

commit;
