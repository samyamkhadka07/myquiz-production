begin;

create or replace function public.review_staged_item(p_id uuid,p_action text,p_data jsonb default null) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare s staged_items;qid uuid;
begin
 perform require_staff();
 select * into s from staged_items where id=p_id for update;
 if not found then raise exception 'Staged item not found';end if;
 if s.status='IMPORTED' then raise exception 'Staged item was already imported';end if;
 if p_action='REJECT' then update staged_items set status='REJECTED',reviewed_by=auth.uid() where id=p_id;return null;end if;
 if p_action='NEEDS_REVISION' then update staged_items set status='NEEDS_REVISION',question_data=coalesce(p_data,question_data),reviewed_by=auth.uid() where id=p_id;return null;end if;
 if p_action not in ('IMPORT','IMPORT_VERIFY','IMPORT_PUBLISH') or p_data is null then raise exception 'Review canonical fields before importing';end if;
 qid=save_question(null,p_data||jsonb_build_object('provenance',coalesce(p_data->'provenance','{}')||coalesce(s.question_data->'provenance','{}')||jsonb_build_object('contribution_id',s.contribution_id,'page',s.source_page,'row',s.source_row,'staged_item_id',s.id)));
 update questions set contribution_id=s.contribution_id,source_page=coalesce(s.source_page,source_page) where id=qid;
 if p_action in ('IMPORT_VERIFY','IMPORT_PUBLISH') then
  perform transition_question(qid,'REVIEW');
  perform transition_question(qid,'VERIFY');
 end if;
 if p_action='IMPORT_PUBLISH' then perform transition_question(qid,'PUBLISH');end if;
 update staged_items set status='IMPORTED',canonical_question_id=qid,question_data=p_data,reviewed_by=auth.uid() where id=p_id;
 insert into audit_events(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'STAGED_ITEM_'||p_action,'question',qid::text,jsonb_build_object('staged_item_id',p_id));
 return qid;
end $$;

grant execute on function public.review_staged_item(uuid,text,jsonb) to authenticated;

create or replace function public.start_learning_game(p_mode text,p_count integer default 10) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid; sid uuid; chosen integer; result jsonb;
begin
 uid=require_user();
 if p_mode not in ('RAPID_FIRE','RAPID_RECALL','MISTAKE_RESCUE','ACCURACY','DAILY_CHALLENGE') or p_count not between 1 and 20 then raise exception 'Invalid learning game' using errcode='22023'; end if;
 if p_mode in ('MISTAKE_RESCUE','DAILY_CHALLENGE') and not has_premium() then raise exception 'Premium entitlement required' using errcode='42501';end if;
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

commit;
