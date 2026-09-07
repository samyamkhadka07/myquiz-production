begin;
create extension if not exists pgcrypto;
create extension if not exists citext;

create type public.app_role as enum ('STUDENT','MODERATOR','ADMIN','SUPER_ADMIN');
create type public.question_stage as enum ('SOURCE_CAPTURED','EXTRACTED','STAGED','VALIDATION_REQUIRED','PENDING_REVIEW','VERIFIED','PUBLISHED','ARCHIVED');
create type public.answer_key as enum ('A','B','C','D');
create type public.cognitive_level as enum ('RECALL','UNDERSTANDING','APPLICATION');
create type public.difficulty_level as enum ('EASY','MEDIUM','HARD');
create type public.attempt_status as enum ('ACTIVE','COMPLETED','EXPIRED','ABANDONED');
create type public.entitlement_tier as enum ('FREE','PREMIUM');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(display_name) between 1 and 80),
  role public.app_role not null default 'STUDENT',
  target_score numeric(6,2) check (target_score between -50 and 200),
  timezone text not null default 'Asia/Kathmandu',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.entitlements (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  tier public.entitlement_tier not null default 'FREE',
  starts_at timestamptz not null default now(), ends_at timestamptz,
  granted_by uuid references public.profiles(id), updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create table public.exam_groups (
  id uuid primary key default gen_random_uuid(), code text not null unique, name text not null,
  syllabus_version text not null, source_document text not null, source_revision_date date not null,
  active boolean not null default true, created_at timestamptz not null default now()
);
create table public.subjects (id uuid primary key default gen_random_uuid(), code text not null unique, name text not null, created_at timestamptz not null default now());
create table public.units (
  id uuid primary key default gen_random_uuid(), subject_id uuid not null references public.subjects(id) on delete restrict,
  code text not null, name text not null, position integer not null check(position>0), source_page integer,
  unique(subject_id,code), unique(subject_id,position)
);
create table public.topics (
  id uuid primary key default gen_random_uuid(), unit_id uuid not null references public.units(id) on delete restrict,
  name text not null, position integer not null check(position>0), source_text text, unique(unit_id,name)
);
create table public.exam_blueprints (
  id uuid primary key default gen_random_uuid(), exam_group_id uuid not null references public.exam_groups(id),
  version integer not null default 1, question_count integer not null check(question_count>0), duration_seconds integer not null check(duration_seconds>0),
  marks_correct numeric(5,2) not null, marks_incorrect numeric(5,2) not null, marks_unanswered numeric(5,2) not null default 0,
  qualification_rule jsonb not null, cognitive_distribution jsonb not null,
  effective_from date not null, effective_to date, published boolean not null default false,
  unique(exam_group_id,version), check(effective_to is null or effective_to>=effective_from)
);
create table public.blueprint_allocations (
  blueprint_id uuid not null references public.exam_blueprints(id) on delete cascade,
  subject_id uuid not null references public.subjects(id), unit_id uuid references public.units(id),
  question_count integer not null check(question_count>0), primary key(blueprint_id,subject_id,unit_id)
);

create function public.current_role() returns public.app_role language sql stable security definer set search_path=public as $$ select coalesce((select role from profiles where id=auth.uid()),'STUDENT'::app_role) $$;
create function public.is_staff() returns boolean language sql stable as $$ select public.current_role() in ('MODERATOR','ADMIN','SUPER_ADMIN') $$;
create function public.is_admin() returns boolean language sql stable as $$ select public.current_role() in ('ADMIN','SUPER_ADMIN') $$;
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into profiles(id,display_name) values(new.id,coalesce(nullif(new.raw_user_meta_data->>'display_name',''),split_part(new.email,'@',1))); insert into entitlements(user_id) values(new.id); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.entitlements enable row level security;
alter table public.exam_groups enable row level security;
alter table public.subjects enable row level security;
alter table public.units enable row level security;
alter table public.topics enable row level security;
alter table public.exam_blueprints enable row level security;
alter table public.blueprint_allocations enable row level security;
create policy profiles_self_read on public.profiles for select using(id=auth.uid() or public.is_staff());
create policy profiles_self_update on public.profiles for update using(id=auth.uid()) with check(id=auth.uid() and role=public.current_role());
create policy profiles_admin_update on public.profiles for update using(public.is_admin()) with check(public.is_admin());
create policy entitlement_self_read on public.entitlements for select using(user_id=auth.uid() or public.is_admin());
create policy entitlement_admin_write on public.entitlements for all using(public.is_admin()) with check(public.is_admin());
create policy academic_public_read on public.exam_groups for select using(active);
create policy subjects_public_read on public.subjects for select using(true);
create policy units_public_read on public.units for select using(true);
create policy topics_public_read on public.topics for select using(true);
create policy blueprint_public_read on public.exam_blueprints for select using(published);
create policy allocation_public_read on public.blueprint_allocations for select using(exists(select 1 from exam_blueprints b where b.id=blueprint_id and b.published));
commit;
