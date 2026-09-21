begin;

-- Manual-payment requests are only actionable when they point to an authenticated
-- student's private receipt object.  The old four-argument RPC did not carry that
-- object path, so replace it rather than leave a weaker overload callable.
drop function if exists public.submit_payment_request(uuid,uuid,text,text);

create function public.submit_payment_request(
  p_plan uuid,
  p_method uuid,
  p_reference text,
  p_note text,
  p_receipt_object_path text
) returns public.payment_requests
language plpgsql security definer set search_path=public,storage,pg_temp as $$
declare uid uuid;plan subscription_plans;method payment_methods;result payment_requests;receipt_path text;
begin
 uid=require_user();
 receipt_path=nullif(trim(p_receipt_object_path),'');
 if receipt_path is null or receipt_path !~ ('^'||uid::text||'/[0-9a-f-]{36}\.(png|jpe?g|webp|pdf)$') then
  raise exception 'A valid payment receipt is required' using errcode='22023';
 end if;
 if not exists(select 1 from storage.objects where bucket_id='payment-receipts' and name=receipt_path) then
  raise exception 'Payment receipt is unavailable' using errcode='42501';
 end if;
 select * into plan from subscription_plans where id=p_plan and enabled and archived_at is null and price_npr>0;
 if not found then raise exception 'Paid plan is unavailable' using errcode='P0002';end if;
 select * into method from payment_methods where id=p_method and enabled;
 if not found then raise exception 'Payment method is unavailable' using errcode='P0002';end if;
 insert into payment_requests(user_id,plan_id,plan_version,plan_snapshot,payment_method_id,amount_npr,reference_id,receipt_object_path,note)
 values(uid,plan.id,plan.version,to_jsonb(plan),method.id,plan.price_npr,trim(p_reference),receipt_path,nullif(trim(p_note),'')) returning * into result;
 insert into audit_events(actor_id,action,target_type,target_id,metadata)
 values(uid,'PAYMENT_REQUEST_SUBMITTED','payment_request',result.id::text,jsonb_build_object('receipt_attached',true));
 return result;
end $$;

create or replace function public.save_payment_method(p_id uuid,p_data jsonb) returns public.payment_methods language plpgsql security definer set search_path=public,pg_temp as $$
declare result payment_methods;has_destination boolean;
begin
 if not is_admin() then raise exception 'Admin access required' using errcode='42501';end if;
 has_destination=coalesce(nullif(trim(p_data->>'qr_object_path'),''),null) is not null
   or (nullif(trim(p_data->>'account_identifier'),'' ) is not null and nullif(trim(p_data->>'instructions'),'' ) is not null);
 if coalesce((p_data->>'enabled')::boolean,false) and not has_destination then
  raise exception 'Configure a QR or an identifier with student instructions before enabling this payment method' using errcode='22023';
 end if;
 if p_id is null then
  insert into payment_methods(code,name,enabled,qr_object_path,display_name,instructions,account_identifier,verification_instructions,display_order,updated_by)
  values(upper(trim(p_data->>'code')),trim(p_data->>'name'),coalesce((p_data->>'enabled')::boolean,false),nullif(trim(p_data->>'qr_object_path'),''),nullif(trim(p_data->>'display_name'),''),nullif(trim(p_data->>'instructions'),''),nullif(trim(p_data->>'account_identifier'),''),nullif(trim(p_data->>'verification_instructions'),''),coalesce((p_data->>'display_order')::integer,0),auth.uid()) returning * into result;
 else
  update payment_methods set name=trim(p_data->>'name'),enabled=coalesce((p_data->>'enabled')::boolean,false),qr_object_path=nullif(trim(p_data->>'qr_object_path'),''),display_name=nullif(trim(p_data->>'display_name'),''),instructions=nullif(trim(p_data->>'instructions'),''),account_identifier=nullif(trim(p_data->>'account_identifier'),''),verification_instructions=nullif(trim(p_data->>'verification_instructions'),''),display_order=coalesce((p_data->>'display_order')::integer,0),updated_at=now(),updated_by=auth.uid() where id=p_id returning * into result;
  if not found then raise exception 'Payment method not found' using errcode='P0002';end if;
 end if;
 insert into audit_events(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'PAYMENT_METHOD_SAVED','payment_method',result.id::text,jsonb_build_object('enabled',result.enabled,'qr_configured',result.qr_object_path is not null));
 return result;
end $$;

insert into public.payment_methods(code,name,display_order) values('FONEPAY','Fonepay',60) on conflict(code) do nothing;

create policy payment_receipt_owner_delete on storage.objects for delete to authenticated using(bucket_id='payment-receipts' and (storage.foldername(name))[1]=auth.uid()::text);
create policy payment_asset_admin_delete on storage.objects for delete to authenticated using(bucket_id='payment-assets' and public.is_admin());

grant execute on function public.submit_payment_request(uuid,uuid,text,text,text),public.save_payment_method(uuid,jsonb) to authenticated;

commit;
