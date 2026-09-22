-- MANUAL PRE-LAUNCH LEARNER RESET. DO NOT RUN UNTIL YOU REPLACE THE UUID ARRAY.
-- It preserves Auth identities, profiles, roles, subscriptions, payment evidence, questions and taxonomy.
begin;
create temporary table reset_users(id uuid primary key) on commit drop;
-- Required explicit selection: insert into reset_users values ('00000000-0000-0000-0000-000000000000');
do $$ begin if not exists(select 1 from reset_users) then raise exception 'Add explicit preserved-user UUIDs before running this reset'; end if; end $$;
delete from attempt_question_keys where attempt_id in(select id from attempts where user_id in(select id from reset_users));
delete from attempt_questions where attempt_id in(select id from attempts where user_id in(select id from reset_users));
delete from attempts where user_id in(select id from reset_users);
delete from learning_game_items where session_id in(select id from learning_game_sessions where user_id in(select id from reset_users));
delete from learning_game_sessions where user_id in(select id from reset_users);
delete from flashcard_reviews where user_id in(select id from reset_users);
delete from flashcards where user_id in(select id from reset_users);
delete from question_bookmarks where user_id in(select id from reset_users);
delete from ai_usage_logs where user_id in(select id from reset_users);
update profiles set target_score=null,xp=0,updated_at=now() where id in(select id from reset_users);
commit;
