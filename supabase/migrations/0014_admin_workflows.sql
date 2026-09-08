begin;
alter table public.staged_items drop constraint staged_items_status_check;
alter table public.staged_items add constraint staged_items_status_check check(status in ('PENDING_REVIEW','NEEDS_REVISION','IMPORTED','REJECTED','DUPLICATE'));
create or replace function public.review_staged_item(p_id uuid,p_action text,p_data jsonb default null) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare s staged_items;qid uuid;
begin perform require_staff();select * into s from staged_items where id=p_id for update;if not found then raise exception 'Staged item not found';end if;
 if p_action='REJECT' then update staged_items set status='REJECTED',reviewed_by=auth.uid() where id=p_id;return null;end if;
 if p_action='NEEDS_REVISION' then update staged_items set status='NEEDS_REVISION',question_data=coalesce(p_data,question_data),reviewed_by=auth.uid() where id=p_id;return null;end if;
 if p_action<>'IMPORT' or p_data is null then raise exception 'Review canonical fields before importing';end if;
 qid=save_question(null,p_data||jsonb_build_object('provenance',coalesce(p_data->'provenance','{}')||coalesce(s.question_data->'provenance','{}')||jsonb_build_object('contribution_id',s.contribution_id,'page',s.source_page,'row',s.source_row,'staged_item_id',s.id)));
 update questions set contribution_id=s.contribution_id,source_page=coalesce(s.source_page,source_page) where id=qid;update staged_items set status='IMPORTED',canonical_question_id=qid,question_data=p_data,reviewed_by=auth.uid() where id=p_id;return qid;end $$;
create function public.resolve_report(p_id uuid,p_action text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin perform require_staff();if p_action not in ('DISMISS','HIDE','DELETE') then raise exception 'Invalid report action';end if;
 update comment_reports set status=case when p_action='DISMISS' then 'DISMISSED' else 'RESOLVED' end,moderated_by=auth.uid(),resolved_at=now() where id=p_id and status='OPEN';if not found then raise exception 'Open report not found';end if;
 if p_action in ('HIDE','DELETE') then update comments set status=p_action where id=(select comment_id from comment_reports where id=p_id);end if;end $$;
create function public.review_contribution(p_id uuid,p_action text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin perform require_staff();if p_action not in ('APPROVE','REJECT','NEEDS_REVISION') then raise exception 'Invalid review action';end if;update contributions set review_state=case p_action when 'APPROVE' then 'APPROVED' when 'REJECT' then 'REJECTED' else 'NEEDS_REVISION' end where id=p_id;if not found then raise exception 'Contribution not found';end if;insert into audit_events(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'CONTRIBUTION_REVIEWED','contribution',p_id::text,jsonb_build_object('action',p_action));end $$;
grant execute on function public.resolve_report(uuid,text),public.review_contribution(uuid,text) to authenticated;
commit;
