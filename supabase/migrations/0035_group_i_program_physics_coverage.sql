begin;
insert into public.questions
(question_text,option_a,option_b,option_c,option_d,correct_answer,explanation,option_explanations,
 subject_id,unit_id,topic_id,difficulty,cognitive_level,source_type,source_document,
 source_question_number,provenance,content_fingerprint)
select
 'A capacitor holds 30 μC of charge when the potential difference is 5 V. Find its capacitance.',
 '3 μF','5 μF','6 μF','8 μF','C',
 'Capacitance C = Q/V = 30 μC / 5 V = 6 μF.',
 '{"A":"","B":"","C":"","D":""}'::jsonb,s.id,u.id,t.id,
 'EASY'::public.difficulty_level,'APPLICATION'::public.cognitive_level,'AI',
 'MyQuiz Original Provisional Practice','P-CAP-SUPPLEMENT-1',
 '{"provisional_practice":true,"academic_review":"PENDING","template":"capacitance_relation","original_created_for":"MyQuiz","source_rights":"original","exam_group":"I"}'::jsonb,
 'pending'
from public.subjects s join public.units u on u.subject_id=s.id
left join public.topics t on t.unit_id=u.id and t.name='Capacitors'
where s.code='PHYSICS' and u.code='P5'
on conflict do nothing;
commit;