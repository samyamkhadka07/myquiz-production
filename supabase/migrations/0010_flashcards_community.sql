begin;
create table public.flashcards(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),question_id uuid not null references public.questions(id),
 front text not null,back text not null,topic_id uuid references public.topics(id),due timestamptz not null default now(),
 state jsonb not null default '{"stability":0,"difficulty":0,"elapsed_days":0,"scheduled_days":0,"learning_steps":0,"reps":0,"lapses":0,"state":0}',revision integer not null default 0,created_at timestamptz not null default now(),unique(user_id,question_id)
);
create index flashcard_due_idx on public.flashcards(user_id,due);
create table public.flashcard_reviews(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),card_id uuid not null references public.flashcards(id),rating integer not null check(rating between 1 and 4),reviewed_at timestamptz not null default now(),previous_state jsonb not null,next_state jsonb not null,review_log jsonb not null,request_key uuid not null,unique(user_id,request_key));
alter table public.flashcards enable row level security;alter table public.flashcard_reviews enable row level security;
create policy own on public.flashcards for select using(user_id=auth.uid());create policy own on public.flashcard_reviews for select using(user_id=auth.uid());
grant select on public.flashcards,public.flashcard_reviews to authenticated;
create function public.add_flashcard(p_question uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare result uuid; item record;
begin
 perform require_user();select q.snapshot,k.correct_answer,k.explanation into item from attempt_questions q join attempts a on a.id=q.attempt_id join attempt_question_keys k using(attempt_id,question_id) where q.question_id=p_question and a.user_id=auth.uid() and a.status in ('COMPLETED','EXPIRED') order by a.completed_at desc limit 1;
 if not found then raise exception 'Review a completed question first' using errcode='42501'; end if;
 insert into flashcards(user_id,question_id,front,back,topic_id) values(auth.uid(),p_question,item.snapshot->>'question_text',item.correct_answer::text||'. '||(item.snapshot->>('option_'||lower(item.correct_answer::text)))||E'\n\n'||item.explanation,(item.snapshot->>'topic_id')::uuid)
 on conflict(user_id,question_id) do update set question_id=excluded.question_id returning id into result;return result;
end $$;
create function public.commit_flashcard_review(p_user uuid,p_card uuid,p_rating integer,p_state jsonb,p_log jsonb,p_revision integer,p_request uuid) returns public.flashcards language plpgsql security definer set search_path=public,pg_temp as $$
declare card flashcards;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server scheduler required' using errcode='42501'; end if;
 select * into card from flashcards where id=p_card and user_id=p_user for update;
 if not found then raise exception 'Card not found' using errcode='P0002'; end if;
 if exists(select 1 from flashcard_reviews where user_id=p_user and request_key=p_request and card_id=p_card) then return card; end if;
 if card.revision<>p_revision then raise exception 'Card changed; refresh and retry' using errcode='40001'; end if;
 if card.due>clock_timestamp() then raise exception 'Card is not due'; end if;
 if p_rating not between 1 and 4 or (p_state->>'stability')::numeric<0 or (p_state->>'difficulty')::numeric not between 0 and 10 or (p_state->>'state')::integer not between 0 and 3 or (p_state->>'reps')::integer<>(card.state->>'reps')::integer+1 then raise exception 'Invalid scheduling state'; end if;
 insert into flashcard_reviews(user_id,card_id,rating,previous_state,next_state,review_log,request_key) values(p_user,p_card,p_rating,card.state,p_state,p_log,p_request);
 update flashcards set state=p_state,due=(p_state->>'due')::timestamptz,revision=revision+1 where id=p_card returning * into card;
 return card;
end $$;
grant execute on function public.add_flashcard(uuid) to authenticated;
grant execute on function public.commit_flashcard_review(uuid,uuid,integer,jsonb,jsonb,integer,uuid) to service_role;
grant all on public.flashcards,public.flashcard_reviews to service_role;

create table public.comments(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),parent_id uuid references public.comments(id),question_id uuid references public.questions(id),body text not null check(length(btrim(body)) between 1 and 4000),status text not null default 'VISIBLE' check(status in ('VISIBLE','HIDDEN','DELETED')),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index comments_feed_idx on public.comments(created_at desc) where status='VISIBLE';
create index comments_parent_idx on public.comments(parent_id,created_at);
create table public.comment_reactions(comment_id uuid not null references public.comments(id),user_id uuid not null references public.profiles(id),reaction text not null check(reaction in ('HELPFUL','THANKS')),created_at timestamptz not null default now(),primary key(comment_id,user_id));
create table public.comment_reports(id uuid primary key default gen_random_uuid(),comment_id uuid not null references public.comments(id),user_id uuid not null references public.profiles(id),reason text not null check(length(reason) between 3 and 1000),status text not null default 'OPEN' check(status in ('OPEN','RESOLVED','DISMISSED')),moderated_by uuid references public.profiles(id),created_at timestamptz not null default now(),resolved_at timestamptz,unique(comment_id,user_id));
alter table public.comments enable row level security;alter table public.comment_reactions enable row level security;alter table public.comment_reports enable row level security;
create policy readable on public.comments for select using(is_staff() or (status='VISIBLE' and (question_id is null or exists(select 1 from attempt_questions q join attempts a on a.id=q.attempt_id where q.question_id=comments.question_id and a.user_id=auth.uid() and a.status in ('COMPLETED','EXPIRED')))));
create policy readable on public.comment_reactions for select using(exists(select 1 from comments c where c.id=comment_id));
create policy readable on public.comment_reports for select using(user_id=auth.uid() or is_staff());
grant select on public.comments,public.comment_reactions,public.comment_reports to authenticated;
create function public.write_comment(p_id uuid,p_parent uuid,p_question uuid,p_body text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare result uuid; parent comments;
begin
 perform require_user();perform 1 from profiles where id=auth.uid() for update;
 if p_parent is not null then
  select * into parent from comments where id=p_parent and status='VISIBLE';
  if not found or parent.parent_id is not null then raise exception 'Replies must belong to a visible top-level comment'; end if;
  p_question=parent.question_id;
 end if;
 if p_question is not null and not exists(select 1 from attempt_questions q join attempts a on a.id=q.attempt_id where q.question_id=p_question and a.user_id=auth.uid() and a.status in ('COMPLETED','EXPIRED')) then raise exception 'Complete this question before joining its discussion' using errcode='42501'; end if;
 if p_id is not null then
  update comments set body=btrim(p_body),updated_at=now() where id=p_id and user_id=auth.uid() and status='VISIBLE' returning id into result;
  if not found then raise exception 'Comment not found' using errcode='P0002'; end if;
 else
  if (select count(*) from comments where user_id=auth.uid() and created_at>now()-interval '10 minutes')>=10 then raise exception 'Comment limit reached. Try again later'; end if;
  insert into comments(user_id,parent_id,question_id,body) values(auth.uid(),p_parent,p_question,btrim(p_body)) returning id into result;
 end if;
 return result;
end $$;
create function public.react_comment(p_comment uuid,p_reaction text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform require_user();if not exists(select 1 from comments c where c.id=p_comment and c.status='VISIBLE' and (c.question_id is null or exists(select 1 from attempt_questions q join attempts a on a.id=q.attempt_id where q.question_id=c.question_id and a.user_id=auth.uid() and a.status in ('COMPLETED','EXPIRED')))) then raise exception 'Comment not available' using errcode='42501'; end if;
 if p_reaction is null then delete from comment_reactions where comment_id=p_comment and user_id=auth.uid();
 else insert into comment_reactions(comment_id,user_id,reaction) values(p_comment,auth.uid(),p_reaction) on conflict(comment_id,user_id) do update set reaction=excluded.reaction; end if;
end $$;
create function public.report_comment(p_comment uuid,p_reason text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform require_user();perform 1 from profiles where id=auth.uid() for update;
 if (select count(*) from comment_reports where user_id=auth.uid() and created_at>now()-interval '1 hour')>=10 then raise exception 'Report limit reached'; end if;
 if not exists(select 1 from comments where id=p_comment and status='VISIBLE') then raise exception 'Comment not available'; end if;
 insert into comment_reports(comment_id,user_id,reason) values(p_comment,auth.uid(),btrim(p_reason)) on conflict(comment_id,user_id) do nothing;
end $$;
create function public.moderate_comment(p_comment uuid,p_action text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform require_user();
 if p_action='DELETE' then update comments set status='DELETED',body='Comment removed',updated_at=now() where id=p_comment and (user_id=auth.uid() or is_staff());
 elsif p_action in ('HIDE','RESTORE') then perform require_staff();update comments set status=case when p_action='HIDE' then 'HIDDEN' else 'VISIBLE' end,updated_at=now() where id=p_comment;
 else raise exception 'Invalid moderation action'; end if;
 if not found then raise exception 'Comment not found' using errcode='P0002'; end if;
 if is_staff() then update comment_reports set status='RESOLVED',moderated_by=auth.uid(),resolved_at=now() where comment_id=p_comment and status='OPEN'; end if;
 insert into audit_events(actor_id,action,target_type,target_id) values(auth.uid(),'COMMENT_'||p_action,'comment',p_comment::text);
end $$;
grant execute on function public.write_comment(uuid,uuid,uuid,text),public.react_comment(uuid,text),public.report_comment(uuid,text),public.moderate_comment(uuid,text) to authenticated;
commit;
