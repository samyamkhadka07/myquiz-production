begin;

drop function public.review_contribution(uuid,text);

create function public.review_contribution(p_id uuid, p_action text)
returns text
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  previous_state text;
  next_state text;
begin
  perform require_staff();
  select review_state into previous_state from contributions where id=p_id for update;
  if not found then raise exception 'Contribution not found'; end if;

  next_state := case p_action
    when 'APPROVE' then 'APPROVED'
    when 'REJECT' then 'REJECTED'
    when 'NEEDS_REVISION' then 'NEEDS_REVISION'
    when 'REOPEN' then 'PENDING_REVIEW'
    else null
  end;
  if next_state is null then raise exception 'Invalid review action'; end if;
  if p_action='REOPEN' and previous_state not in ('APPROVED','REJECTED') then
    raise exception 'Only completed reviews can be reopened';
  end if;
  if p_action<>'REOPEN' and previous_state not in ('PENDING','PENDING_REVIEW','NEEDS_REVISION') then
    raise exception 'Review is already complete; reopen it before changing the decision';
  end if;

  update contributions set review_state=next_state where id=p_id;
  insert into audit_events(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'CONTRIBUTION_REVIEWED','contribution',p_id::text,
    jsonb_build_object('action',p_action,'previous_state',previous_state,'next_state',next_state));
  return next_state;
end $$;

grant execute on function public.review_contribution(uuid,text) to authenticated;

commit;
