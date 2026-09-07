begin;
create table public.contributions (
 id uuid primary key default gen_random_uuid(), uploader_id uuid not null references public.profiles(id), category text not null,
 original_filename text not null, mime_type text not null, byte_size bigint not null check(byte_size>=0), checksum_sha256 text,
 bucket text not null default 'contributions', object_path text not null unique,
 processing_state text not null default 'UPLOADED', review_state text not null default 'PENDING', error_code text, error_detail text,
 created_at timestamptz not null default now(), finalized_at timestamptz, archived_at timestamptz,
 check(object_path = 'contributions/'||uploader_id::text||'/'||id::text||'/'||original_filename)
);
create table public.questions (
 id uuid primary key default gen_random_uuid(), question_text text not null check(length(question_text)>0),
 option_a text not null, option_b text not null, option_c text not null, option_d text not null,
 correct_answer public.answer_key, explanation text, option_explanations jsonb not null default '{}'::jsonb,
 subject_id uuid not null references public.subjects(id), unit_id uuid references public.units(id), topic_id uuid references public.topics(id), subtopic text,
 difficulty public.difficulty_level, cognitive_level public.cognitive_level,
 source_type text not null, source_year integer, source_document text, source_url text, source_page integer check(source_page>0), source_question_number text,
 contribution_id uuid references public.contributions(id), external_source_id uuid,
 provenance jsonb not null default '{}'::jsonb, extraction_confidence numeric(4,3) check(extraction_confidence between 0 and 1),
 lifecycle public.question_stage not null default 'STAGED', verification_status text not null default 'UNVERIFIED', publication_status text not null default 'DRAFT',
 content_fingerprint text not null, created_by uuid references public.profiles(id), verified_by uuid references public.profiles(id),
 verified_at timestamptz, published_at timestamptz, archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(content_fingerprint),
 check((lifecycle not in ('VERIFIED','PUBLISHED')) or (correct_answer is not null and verified_by is not null and verified_at is not null)),
 check((lifecycle <> 'PUBLISHED') or (publication_status='PUBLISHED' and published_at is not null))
);
create index questions_eligible_idx on public.questions(subject_id,unit_id,topic_id,difficulty,cognitive_level) where lifecycle='PUBLISHED' and verification_status='VERIFIED' and publication_status='PUBLISHED';
create table public.attempts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), blueprint_id uuid references public.exam_blueprints(id),
 mode text not null, status public.attempt_status not null default 'ACTIVE', started_at timestamptz not null default now(), expires_at timestamptz,
 completed_at timestamptz, score numeric(7,2), max_score numeric(7,2), correct_count integer, incorrect_count integer, unanswered_count integer,
 selection_seed uuid not null default gen_random_uuid(), created_at timestamptz not null default now()
);
create index attempts_user_started_idx on public.attempts(user_id,started_at desc);
create table public.attempt_questions (
 attempt_id uuid not null references public.attempts(id) on delete cascade, question_id uuid not null references public.questions(id),
 position integer not null check(position>0), selected_answer public.answer_key, response_ms integer check(response_ms>=0), answered_at timestamptz,
 awarded_marks numeric(5,2), is_correct boolean, primary key(attempt_id,question_id), unique(attempt_id,position)
);
create table public.bookmarks (user_id uuid not null references public.profiles(id), question_id uuid not null references public.questions(id), created_at timestamptz not null default now(), primary key(user_id,question_id));
alter table public.contributions enable row level security; alter table public.questions enable row level security; alter table public.attempts enable row level security; alter table public.attempt_questions enable row level security; alter table public.bookmarks enable row level security;
create policy contribution_owner_read on public.contributions for select using(uploader_id=auth.uid() or public.is_staff());
create policy contribution_owner_insert on public.contributions for insert with check(uploader_id=auth.uid());
create policy contribution_staff_update on public.contributions for update using(public.is_staff()) with check(public.is_staff());
create policy published_question_read on public.questions for select using((lifecycle='PUBLISHED' and verification_status='VERIFIED' and publication_status='PUBLISHED') or public.is_staff());
create policy question_staff_write on public.questions for all using(public.is_staff()) with check(public.is_staff());
create policy attempts_owner_read on public.attempts for select using(user_id=auth.uid() or public.is_admin());
create policy attempts_owner_insert on public.attempts for insert with check(user_id=auth.uid());
create policy attempt_questions_owner on public.attempt_questions for select using(exists(select 1 from attempts a where a.id=attempt_id and (a.user_id=auth.uid() or public.is_admin())));
create policy bookmarks_owner on public.bookmarks for all using(user_id=auth.uid()) with check(user_id=auth.uid());
revoke select on public.questions from anon, authenticated;
grant select(id,question_text,option_a,option_b,option_c,option_d,subject_id,unit_id,topic_id,subtopic,difficulty,cognitive_level,source_type,source_year,source_document,source_url,source_page,source_question_number,provenance,lifecycle,verification_status,publication_status,created_at,updated_at) on public.questions to anon, authenticated;
commit;
