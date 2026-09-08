begin;
alter table public.units add column source_text text;
alter table public.topics add column source_page integer check(source_page>0);
create table public.subtopics (
 id uuid primary key default gen_random_uuid(), topic_id uuid not null references public.topics(id),
 name text not null, source_text text not null, source_page integer not null check(source_page>0),
 position integer not null check(position>0), unique(topic_id,name)
);
create table public.exam_programs (
 id uuid primary key default gen_random_uuid(), exam_group_id uuid not null references public.exam_groups(id),
 code text not null unique, name text not null, academic_detail_status text not null
 check(academic_detail_status in ('SOURCE_DEFINED','PCL_DETAIL_UNSPECIFIED'))
);
alter table public.profiles add column exam_program_id uuid references public.exam_programs(id);
alter table public.questions add column exam_program_id uuid references public.exam_programs(id);
alter table public.questions add column subtopic_id uuid references public.subtopics(id);
alter table public.subtopics enable row level security;
alter table public.exam_programs enable row level security;
create policy academic_read on public.subtopics for select using(true);
create policy academic_read on public.exam_programs for select using(true);
grant select on public.exam_groups, public.exam_programs, public.subjects, public.units, public.topics, public.subtopics, public.exam_blueprints, public.blueprint_allocations to anon,authenticated;
commit;
