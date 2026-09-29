-- Forward-only corrections for the already-applied student reset/recovery migration.
--
-- `attempt_question_keys` is not protected by a foreign key to `attempts`.
-- The original reset and restore paths therefore needed to remove those rows
-- explicitly before deleting attempts, otherwise a later restore could retain
-- answer-key material and fail on duplicate keys.  This migration only changes
-- the functions used for future reset/recovery operations; it does not reset
-- any student and does not alter any existing snapshot.

create or replace function public.reset_student_data(p_user uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot_id uuid;
  v_payload jsonb;
  v_target public.profiles;
begin
  perform public.require_user();
  if public.current_role() <> 'SUPER_ADMIN' then
    raise exception 'Super Admin access required' using errcode = '42501';
  end if;
  if p_user is null then
    raise exception 'Student is required' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 1000 then
    raise exception 'Reset reason is required' using errcode = '22023';
  end if;

  -- Serializes reset/recovery for this learner and preserves identity, role,
  -- account status, and all global academic/application configuration.
  select * into v_target
  from public.profiles
  where id = p_user and role = 'STUDENT'
  for update;
  if not found then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;

  -- Snapshot every resettable student record before any mutation.
  select jsonb_build_object(
    'schema_version', 2,
    'profile_progress', jsonb_build_object(
      'exam_program_id', v_target.exam_program_id,
      'target_score', v_target.target_score,
      'onboarding_completed_at', v_target.onboarding_completed_at,
      'self_assessed_weak_subject_ids', v_target.self_assessed_weak_subject_ids
    ),
    'entitlements', coalesce((select jsonb_agg(to_jsonb(x)) from public.entitlements x where x.user_id = p_user), '[]'::jsonb),
    'attempts', coalesce((select jsonb_agg(to_jsonb(x)) from public.attempts x where x.user_id = p_user), '[]'::jsonb),
    'attempt_questions', coalesce((select jsonb_agg(to_jsonb(x)) from public.attempt_questions x join public.attempts a on a.id = x.attempt_id where a.user_id = p_user), '[]'::jsonb),
    'attempt_question_keys', coalesce((select jsonb_agg(to_jsonb(x)) from public.attempt_question_keys x join public.attempts a on a.id = x.attempt_id where a.user_id = p_user), '[]'::jsonb),
    'bookmarks', coalesce((select jsonb_agg(to_jsonb(x)) from public.bookmarks x where x.user_id = p_user), '[]'::jsonb),
    'flashcards', coalesce((select jsonb_agg(to_jsonb(x)) from public.flashcards x where x.user_id = p_user), '[]'::jsonb),
    'flashcard_reviews', coalesce((select jsonb_agg(to_jsonb(x)) from public.flashcard_reviews x where x.user_id = p_user), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(to_jsonb(x)) from public.comments x where x.user_id = p_user), '[]'::jsonb),
    'comment_reactions', coalesce((select jsonb_agg(to_jsonb(x)) from public.comment_reactions x where x.user_id = p_user), '[]'::jsonb),
    'comment_reports', coalesce((select jsonb_agg(to_jsonb(x)) from public.comment_reports x where x.user_id = p_user), '[]'::jsonb),
    'xp_events', coalesce((select jsonb_agg(to_jsonb(x)) from public.xp_events x where x.user_id = p_user), '[]'::jsonb),
    'user_achievements', coalesce((select jsonb_agg(to_jsonb(x)) from public.user_achievements x where x.user_id = p_user), '[]'::jsonb),
    'mascot_events', coalesce((select jsonb_agg(to_jsonb(x)) from public.mascot_events x where x.user_id = p_user), '[]'::jsonb),
    'learning_game_sessions', coalesce((select jsonb_agg(to_jsonb(x)) from public.learning_game_sessions x where x.user_id = p_user), '[]'::jsonb),
    'learning_game_items', coalesce((select jsonb_agg(to_jsonb(x)) from public.learning_game_items x join public.learning_game_sessions s on s.id = x.session_id where s.user_id = p_user), '[]'::jsonb),
    'study_plan_items', coalesce((select jsonb_agg(to_jsonb(x)) from public.study_plan_items x where x.user_id = p_user), '[]'::jsonb),
    'ai_usage_logs', coalesce((select jsonb_agg(to_jsonb(x)) from public.ai_usage_logs x where x.user_id = p_user), '[]'::jsonb),
    'subscriptions', coalesce((select jsonb_agg(to_jsonb(x)) from public.subscriptions x where x.user_id = p_user), '[]'::jsonb),
    'payment_requests', coalesce((select jsonb_agg(to_jsonb(x)) from public.payment_requests x where x.user_id = p_user), '[]'::jsonb),
    'entitlement_feature_overrides', coalesce((select jsonb_agg(to_jsonb(x)) from public.entitlement_feature_overrides x where x.user_id = p_user), '[]'::jsonb),
    'entitlement_feature_grants', coalesce((select jsonb_agg(to_jsonb(x)) from public.entitlement_feature_grants x where x.user_id = p_user), '[]'::jsonb),
    'subscription_notifications', coalesce((select jsonb_agg(to_jsonb(x)) from public.subscription_notifications x where x.user_id = p_user), '[]'::jsonb)
  ) into v_payload;

  insert into public.student_data_snapshots(user_id, created_by, reason, snapshot)
  values (p_user, auth.uid(), btrim(p_reason), v_payload)
  returning id into v_snapshot_id;

  delete from public.comment_reactions where user_id = p_user;
  delete from public.comment_reports where user_id = p_user;
  update public.comments set status = 'DELETED', body = 'Comment removed', updated_at = now() where user_id = p_user;
  delete from public.flashcard_reviews where user_id = p_user;
  delete from public.flashcards where user_id = p_user;
  delete from public.bookmarks where user_id = p_user;
  delete from public.learning_game_sessions where user_id = p_user;
  delete from public.study_plan_items where user_id = p_user;
  -- Explicitly remove answer keys before the parent attempts: this table has
  -- no foreign key cascade and must never survive a student reset.
  delete from public.attempt_question_keys
  where attempt_id in (select id from public.attempts where user_id = p_user);
  delete from public.attempts where user_id = p_user;
  delete from public.xp_events where user_id = p_user;
  delete from public.user_achievements where user_id = p_user;
  delete from public.mascot_events where user_id = p_user;
  delete from public.ai_usage_logs where user_id = p_user;
  delete from public.subscription_notifications where user_id = p_user;
  delete from public.entitlement_feature_overrides where user_id = p_user;
  delete from public.entitlement_feature_grants where user_id = p_user;
  update public.entitlements set active_subscription_id = null where user_id = p_user;
  delete from public.payment_requests where user_id = p_user;
  delete from public.subscriptions where user_id = p_user;
  delete from public.entitlements where user_id = p_user;
  update public.profiles
  set exam_program_id = null,
      target_score = null,
      onboarding_completed_at = null,
      self_assessed_weak_subject_ids = '{}'::uuid[],
      updated_at = now()
  where id = p_user;
  -- Always leave a valid server-authoritative FREE entitlement.
  insert into public.entitlements(user_id, tier, starts_at, ends_at, granted_by, active_subscription_id)
  values (p_user, 'FREE', now(), null, auth.uid(), null);
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'STUDENT_DATA_RESET', 'student_data_snapshot', v_snapshot_id::text,
          jsonb_build_object('user_id', p_user, 'reason', btrim(p_reason)));
  return v_snapshot_id;
end;
$$;

create or replace function public.restore_student_data(p_snapshot uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot public.student_data_snapshots;
  v_target public.profiles;
  v_progress jsonb;
begin
  perform public.require_user();
  if public.current_role() <> 'SUPER_ADMIN' then
    raise exception 'Super Admin access required' using errcode = '42501';
  end if;
  if p_snapshot is null then
    raise exception 'Snapshot is required' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 1000 then
    raise exception 'Recovery reason is required' using errcode = '22023';
  end if;

  select * into v_snapshot from public.student_data_snapshots where id = p_snapshot for update;
  if not found then
    raise exception 'Student data snapshot not found' using errcode = 'P0002';
  end if;
  if v_snapshot.restored_at is not null then
    raise exception 'This snapshot has already been restored' using errcode = '22023';
  end if;
  select * into v_target from public.profiles where id = v_snapshot.user_id and role = 'STUDENT' for update;
  if not found then
    raise exception 'Snapshot student is no longer recoverable' using errcode = 'P0002';
  end if;

  delete from public.comment_reactions where user_id = v_snapshot.user_id;
  delete from public.comment_reports where user_id = v_snapshot.user_id;
  delete from public.flashcard_reviews where user_id = v_snapshot.user_id;
  delete from public.flashcards where user_id = v_snapshot.user_id;
  delete from public.bookmarks where user_id = v_snapshot.user_id;
  delete from public.learning_game_sessions where user_id = v_snapshot.user_id;
  delete from public.study_plan_items where user_id = v_snapshot.user_id;
  -- Remove the non-cascading key rows before replacing attempts.
  delete from public.attempt_question_keys
  where attempt_id in (select id from public.attempts where user_id = v_snapshot.user_id);
  delete from public.attempts where user_id = v_snapshot.user_id;
  delete from public.xp_events where user_id = v_snapshot.user_id;
  delete from public.user_achievements where user_id = v_snapshot.user_id;
  delete from public.mascot_events where user_id = v_snapshot.user_id;
  delete from public.ai_usage_logs where user_id = v_snapshot.user_id;
  delete from public.subscription_notifications where user_id = v_snapshot.user_id;
  delete from public.entitlement_feature_overrides where user_id = v_snapshot.user_id;
  delete from public.entitlement_feature_grants where user_id = v_snapshot.user_id;
  update public.entitlements set active_subscription_id = null where user_id = v_snapshot.user_id;
  delete from public.payment_requests where user_id = v_snapshot.user_id;
  delete from public.subscriptions where user_id = v_snapshot.user_id;
  delete from public.entitlements where user_id = v_snapshot.user_id;

  insert into public.attempts select * from jsonb_populate_recordset(null::public.attempts, v_snapshot.snapshot->'attempts');
  insert into public.attempt_questions select * from jsonb_populate_recordset(null::public.attempt_questions, v_snapshot.snapshot->'attempt_questions');
  insert into public.attempt_question_keys select * from jsonb_populate_recordset(null::public.attempt_question_keys, v_snapshot.snapshot->'attempt_question_keys');
  insert into public.bookmarks select * from jsonb_populate_recordset(null::public.bookmarks, v_snapshot.snapshot->'bookmarks');
  insert into public.flashcards select * from jsonb_populate_recordset(null::public.flashcards, v_snapshot.snapshot->'flashcards');
  insert into public.flashcard_reviews select * from jsonb_populate_recordset(null::public.flashcard_reviews, v_snapshot.snapshot->'flashcard_reviews');
  update public.comments c
  set parent_id = r.parent_id, question_id = r.question_id, body = r.body,
      status = r.status, created_at = r.created_at, updated_at = r.updated_at
  from jsonb_populate_recordset(null::public.comments, v_snapshot.snapshot->'comments') r
  where c.id = r.id and c.user_id = v_snapshot.user_id;
  insert into public.comment_reactions select * from jsonb_populate_recordset(null::public.comment_reactions, v_snapshot.snapshot->'comment_reactions');
  insert into public.comment_reports select * from jsonb_populate_recordset(null::public.comment_reports, v_snapshot.snapshot->'comment_reports');
  insert into public.xp_events overriding system value select * from jsonb_populate_recordset(null::public.xp_events, v_snapshot.snapshot->'xp_events');
  insert into public.user_achievements select * from jsonb_populate_recordset(null::public.user_achievements, v_snapshot.snapshot->'user_achievements');
  insert into public.mascot_events select * from jsonb_populate_recordset(null::public.mascot_events, v_snapshot.snapshot->'mascot_events');
  insert into public.learning_game_sessions select * from jsonb_populate_recordset(null::public.learning_game_sessions, v_snapshot.snapshot->'learning_game_sessions');
  insert into public.learning_game_items select * from jsonb_populate_recordset(null::public.learning_game_items, v_snapshot.snapshot->'learning_game_items');
  insert into public.study_plan_items select * from jsonb_populate_recordset(null::public.study_plan_items, v_snapshot.snapshot->'study_plan_items');
  insert into public.ai_usage_logs select * from jsonb_populate_recordset(null::public.ai_usage_logs, v_snapshot.snapshot->'ai_usage_logs');
  insert into public.subscriptions select * from jsonb_populate_recordset(null::public.subscriptions, v_snapshot.snapshot->'subscriptions');
  insert into public.payment_requests select * from jsonb_populate_recordset(null::public.payment_requests, v_snapshot.snapshot->'payment_requests');
  insert into public.entitlements select * from jsonb_populate_recordset(null::public.entitlements, v_snapshot.snapshot->'entitlements');
  insert into public.entitlement_feature_overrides select * from jsonb_populate_recordset(null::public.entitlement_feature_overrides, v_snapshot.snapshot->'entitlement_feature_overrides');
  insert into public.entitlement_feature_grants select * from jsonb_populate_recordset(null::public.entitlement_feature_grants, v_snapshot.snapshot->'entitlement_feature_grants');
  insert into public.subscription_notifications select * from jsonb_populate_recordset(null::public.subscription_notifications, v_snapshot.snapshot->'subscription_notifications');

  v_progress := v_snapshot.snapshot->'profile_progress';
  update public.profiles
  set exam_program_id = nullif(v_progress->>'exam_program_id', '')::uuid,
      target_score = nullif(v_progress->>'target_score', '')::numeric,
      onboarding_completed_at = nullif(v_progress->>'onboarding_completed_at', '')::timestamptz,
      self_assessed_weak_subject_ids = coalesce(array(select jsonb_array_elements_text(coalesce(v_progress->'self_assessed_weak_subject_ids', '[]'::jsonb))::uuid), '{}'::uuid[]),
      updated_at = now()
  where id = v_snapshot.user_id;
  update public.student_data_snapshots
  set restored_at = now(), restored_by = auth.uid(), restore_reason = btrim(p_reason)
  where id = v_snapshot.id;
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'STUDENT_DATA_RESTORED', 'student_data_snapshot', v_snapshot.id::text,
          jsonb_build_object('user_id', v_snapshot.user_id, 'reason', btrim(p_reason)));
end;
$$;

revoke all on function public.reset_student_data(uuid, text), public.restore_student_data(uuid, text) from public, anon;
grant execute on function public.reset_student_data(uuid, text), public.restore_student_data(uuid, text) to authenticated;
