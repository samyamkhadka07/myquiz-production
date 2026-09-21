begin;

create table public.entitlement_feature_overrides(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 feature text not null check(feature~'^[a-z0-9_]+$'),
 allowed boolean not null,
 starts_at timestamptz not null default now(),
 ends_at timestamptz,
 reason text,
 created_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 revoked_at timestamptz,
 revoked_by uuid references public.profiles(id) on delete set null,
 check(ends_at is null or ends_at>starts_at)
);
create index entitlement_feature_overrides_lookup_idx on public.entitlement_feature_overrides(user_id,feature,starts_at,ends_at) where revoked_at is null;

create table public.entitlement_feature_grants(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 grant_type text not null check(grant_type in('TRIAL','PROMOTIONAL')),
 features jsonb not null check(jsonb_typeof(features)='array' and jsonb_array_length(features)>0),
 starts_at timestamptz not null default now(),
 ends_at timestamptz not null,
 reason text,
 created_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 revoked_at timestamptz,
 revoked_by uuid references public.profiles(id) on delete set null,
 check(ends_at>starts_at)
);
create index entitlement_feature_grants_lookup_idx on public.entitlement_feature_grants(user_id,starts_at,ends_at) where revoked_at is null;

alter table public.entitlement_feature_overrides enable row level security;
alter table public.entitlement_feature_grants enable row level security;
create policy entitlement_feature_overrides_admin_read on public.entitlement_feature_overrides for select to authenticated using(public.is_admin());
create policy entitlement_feature_grants_admin_read on public.entitlement_feature_grants for select to authenticated using(public.is_admin());
grant select on public.entitlement_feature_overrides,public.entitlement_feature_grants to authenticated;
grant all on public.entitlement_feature_overrides,public.entitlement_feature_grants to service_role;

create or replace function public.has_entitlement(p_feature text) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select case
  when exists(
   select 1 from entitlement_feature_overrides o
   where o.user_id=auth.uid() and o.feature=p_feature and o.allowed=false and o.revoked_at is null
    and o.starts_at<=now() and (o.ends_at is null or o.ends_at>now())
  ) then false
  when exists(
   select 1 from entitlement_feature_overrides o
   where o.user_id=auth.uid() and o.feature=p_feature and o.allowed=true and o.revoked_at is null
    and o.starts_at<=now() and (o.ends_at is null or o.ends_at>now())
  ) then true
  when exists(
   select 1 from entitlement_feature_grants g
   where g.user_id=auth.uid() and g.revoked_at is null and g.starts_at<=now() and g.ends_at>now()
    and g.features ? p_feature
  ) then true
  when exists(
   select 1 from subscriptions s
   where s.user_id=auth.uid() and s.status in('ACTIVE','TRIAL','PROMOTIONAL') and s.starts_at<=now()
    and (s.ends_at is null or s.ends_at>now()) and s.entitlement_snapshot ? p_feature
  ) then true
  when exists(
   select 1 from entitlements e
   where e.user_id=auth.uid() and e.tier='PREMIUM' and e.starts_at<=now() and (e.ends_at is null or e.ends_at>now())
  ) then true
  else exists(
   select 1 from subscription_plans p
   where p.code='FREE' and p.enabled and p.archived_at is null and p.features ? p_feature
  )
 end;
$$;

create function public.set_feature_override(p_user uuid,p_feature text,p_allowed boolean,p_starts timestamptz default null,p_ends timestamptz default null,p_reason text default null) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare result uuid;start_time timestamptz:=coalesce(p_starts,now());
begin
 perform require_user();
 if not is_admin() then raise exception 'Admin access required' using errcode='42501';end if;
 if p_feature is null or p_feature!~'^[a-z0-9_]+$' then raise exception 'Invalid feature key' using errcode='22023';end if;
 if not exists(select 1 from profiles where id=p_user) then raise exception 'User not found' using errcode='P0002';end if;
 if p_ends is not null and p_ends<=start_time then raise exception 'Override end must be after start' using errcode='22023';end if;
 update entitlement_feature_overrides set revoked_at=now(),revoked_by=auth.uid()
  where user_id=p_user and feature=p_feature and revoked_at is null;
 insert into entitlement_feature_overrides(user_id,feature,allowed,starts_at,ends_at,reason,created_by)
 values(p_user,p_feature,p_allowed,start_time,p_ends,nullif(trim(p_reason),''),auth.uid()) returning id into result;
 insert into audit_events(actor_id,action,target_type,target_id,metadata)
 values(auth.uid(),'ENTITLEMENT_OVERRIDE_SET','entitlement_override',result::text,jsonb_build_object('user_id',p_user,'feature',p_feature,'allowed',p_allowed,'starts_at',start_time,'ends_at',p_ends,'reason',nullif(trim(p_reason),'')));
 return result;
end $$;

create function public.revoke_feature_override(p_id uuid) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare target entitlement_feature_overrides;
begin
 perform require_user();if not is_admin() then raise exception 'Admin access required' using errcode='42501';end if;
 update entitlement_feature_overrides set revoked_at=now(),revoked_by=auth.uid() where id=p_id and revoked_at is null returning * into target;
 if not found then raise exception 'Active entitlement override not found' using errcode='P0002';end if;
 insert into audit_events(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'ENTITLEMENT_OVERRIDE_REVOKED','entitlement_override',p_id::text,jsonb_build_object('user_id',target.user_id,'feature',target.feature,'allowed',target.allowed));
 return true;
end $$;

create function public.grant_feature_access(p_user uuid,p_kind text,p_features jsonb,p_starts timestamptz,p_ends timestamptz,p_reason text default null) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare result uuid;start_time timestamptz:=coalesce(p_starts,now());
begin
 perform require_user();if not is_admin() then raise exception 'Admin access required' using errcode='42501';end if;
 if p_kind not in('TRIAL','PROMOTIONAL') then raise exception 'Invalid grant type' using errcode='22023';end if;
 if not exists(select 1 from profiles where id=p_user) then raise exception 'User not found' using errcode='P0002';end if;
 if p_features is null or jsonb_typeof(p_features)<>'array' or jsonb_array_length(p_features)=0 or exists(select 1 from jsonb_array_elements_text(p_features) f where f!~'^[a-z0-9_]+$') then raise exception 'Invalid grant features' using errcode='22023';end if;
 if p_ends is null or p_ends<=start_time then raise exception 'Grant end must be after start' using errcode='22023';end if;
 insert into entitlement_feature_grants(user_id,grant_type,features,starts_at,ends_at,reason,created_by)
 values(p_user,p_kind,p_features,start_time,p_ends,nullif(trim(p_reason),''),auth.uid()) returning id into result;
 insert into audit_events(actor_id,action,target_type,target_id,metadata)
 values(auth.uid(),'ENTITLEMENT_GRANT_CREATED','entitlement_grant',result::text,jsonb_build_object('user_id',p_user,'kind',p_kind,'features',p_features,'starts_at',start_time,'ends_at',p_ends,'reason',nullif(trim(p_reason),'')));
 return result;
end $$;

create function public.revoke_feature_grant(p_id uuid) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare target entitlement_feature_grants;
begin
 perform require_user();if not is_admin() then raise exception 'Admin access required' using errcode='42501';end if;
 update entitlement_feature_grants set revoked_at=now(),revoked_by=auth.uid() where id=p_id and revoked_at is null returning * into target;
 if not found then raise exception 'Active entitlement grant not found' using errcode='P0002';end if;
 insert into audit_events(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'ENTITLEMENT_GRANT_REVOKED','entitlement_grant',p_id::text,jsonb_build_object('user_id',target.user_id,'kind',target.grant_type,'features',target.features));
 return true;
end $$;

alter function public.start_attempt(uuid,text,integer,uuid,uuid,uuid) rename to start_attempt_entitlement_base;
revoke execute on function public.start_attempt_entitlement_base(uuid,text,integer,uuid,uuid,uuid) from public,anon,authenticated;
create function public.start_attempt(p_program uuid,p_mode text,p_count integer,p_subject uuid,p_topic uuid,p_request uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform require_user();
 if p_mode='ADAPTIVE' and not has_entitlement('adaptive_practice') then raise exception 'Adaptive practice entitlement required' using errcode='42501';end if;
 return start_attempt_entitlement_base(p_program,p_mode,p_count,p_subject,p_topic,p_request);
end $$;
grant execute on function public.start_attempt(uuid,text,integer,uuid,uuid,uuid) to authenticated;

create or replace function public.start_learning_game(p_mode text,p_count integer default 10) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid; sid uuid; chosen integer; result jsonb;
begin
 uid=require_user();
 if p_mode not in ('RAPID_FIRE','RAPID_RECALL','MISTAKE_RESCUE','ACCURACY','DAILY_CHALLENGE') or p_count not between 1 and 20 then raise exception 'Invalid learning game' using errcode='22023'; end if;
 if p_mode in ('MISTAKE_RESCUE','DAILY_CHALLENGE') and not has_entitlement('premium_games') then raise exception 'Premium games entitlement required' using errcode='42501';end if;
 insert into learning_game_sessions(user_id,mode,question_count) values(uid,p_mode,p_count) returning id into sid;
 insert into learning_game_items(session_id,question_id,position,snapshot,correct_answer,explanation)
 select sid,q.id,row_number() over(order by random()),jsonb_build_object('id',q.id,'question_text',q.question_text,'option_a',q.option_a,'option_b',q.option_b,'option_c',q.option_c,'option_d',q.option_d,'subject_id',q.subject_id,'unit_id',q.unit_id,'topic_id',q.topic_id,'difficulty',q.difficulty),q.correct_answer,q.explanation
 from questions q
 where q.lifecycle='PUBLISHED' and q.verification_status='VERIFIED' and q.publication_status='PUBLISHED'
 and (p_mode<>'MISTAKE_RESCUE' or exists(select 1 from attempt_questions aq join attempts a on a.id=aq.attempt_id where aq.question_id=q.id and a.user_id=uid and a.status in ('COMPLETED','EXPIRED') and aq.is_correct=false))
 order by random() limit p_count;
 get diagnostics chosen=row_count;
 if chosen=0 then delete from learning_game_sessions where id=sid;raise exception 'No eligible verified questions are available for this activity';end if;
 update learning_game_sessions set question_count=chosen where id=sid;
 select jsonb_build_object('id',s.id,'mode',s.mode,'question_count',s.question_count,'items',jsonb_agg(jsonb_build_object('question_id',i.question_id,'position',i.position,'snapshot',i.snapshot) order by i.position)) into result from learning_game_sessions s join learning_game_items i on i.session_id=s.id where s.id=sid group by s.id;
 return result;
end $$;

grant execute on function public.start_learning_game(text,integer) to authenticated;
grant execute on function public.has_entitlement(text),public.set_feature_override(uuid,text,boolean,timestamptz,timestamptz,text),public.revoke_feature_override(uuid),public.grant_feature_access(uuid,text,jsonb,timestamptz,timestamptz,text),public.revoke_feature_grant(uuid) to authenticated;

commit;
