-- Private, unverified revision-prompt staging; not canonical MCQs.
begin;
create table if not exists public.revision_question_drafts (
 source_id text primary key,
 subject_code text not null check (subject_code in ('BOTANY','ZOOLOGY','CHEMISTRY','PHYSICS','MAT')),
 source_document text not null,
 source_page integer not null check (source_page>0),
 source_prompt text not null,
 answer_draft text,
 answer_reason text,
 external_reference text,
 academic_review_status text not null default 'PENDING' check (academic_review_status in ('PENDING','NEEDS_CLARIFICATION','VERIFIED','REJECTED')),
 publication_rights_status text not null default 'UNCONFIRMED' check (publication_rights_status in ('UNCONFIRMED','CLEARED','RESTRICTED')),
 canonical_question_id uuid references public.questions(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint reason_requires_answer check (answer_reason is null or nullif(trim(answer_draft),'') is not null),
 constraint verification_requires_reason check (academic_review_status<>'VERIFIED' or (nullif(trim(answer_reason),'') is not null and nullif(trim(answer_draft),'') is not null))
);
create index if not exists revision_drafts_subject_status_idx on public.revision_question_drafts(subject_code,academic_review_status);
alter table public.revision_question_drafts enable row level security;
revoke all on table public.revision_question_drafts from public,anon,authenticated;
comment on table public.revision_question_drafts is 'Staff-only revision fact staging; source prompts require academic verification and rights clearance before conversion to canonical quiz MCQs.';
commit;
