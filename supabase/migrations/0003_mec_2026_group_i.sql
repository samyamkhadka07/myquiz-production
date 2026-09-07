begin;
insert into public.exam_groups(code,name,syllabus_version,source_document,source_revision_date)
values ('I','MBBS, BDS, BSc Nursing/BSc Midwifery, BASLP & B. Perfusion Technology','MEC Bachelor CEE 2020, third revision 2026','syllabus_bachelor_program_revised__2026 (1).pdf','2026-04-28');
insert into public.subjects(code,name) values ('ZOOLOGY','Zoology'),('BOTANY','Botany'),('CHEMISTRY','Chemistry'),('PHYSICS','Physics'),('MAT','Mental Agility Test');
insert into public.units(subject_id,code,name,position,source_page) values
((select id from subjects where code='ZOOLOGY'),'Z1','Evolutionary Biology',1,4),
((select id from subjects where code='ZOOLOGY'),'Z2','Animal Diversity and Classification',2,4),
((select id from subjects where code='ZOOLOGY'),'Z3','Animal Tissues and Histology',3,4),
((select id from subjects where code='ZOOLOGY'),'Z4','Study of Selected Animals',4,4),
((select id from subjects where code='ZOOLOGY'),'Z5','Human Biology and Physiology',5,4),
((select id from subjects where code='ZOOLOGY'),'Z6','Microbial Diseases and Immunology',6,4),
((select id from subjects where code='ZOOLOGY'),'Z7','Medical Technology and Applied Biology',7,4),
((select id from subjects where code='ZOOLOGY'),'Z8','Biota, Environment and Conservation',8,4),
((select id from subjects where code='BOTANY'),'B1','Basic component of life',1,4),
((select id from subjects where code='BOTANY'),'B2','Biodiversity',2,4),
((select id from subjects where code='BOTANY'),'B3','Ecology and vegetation',3,4),
((select id from subjects where code='BOTANY'),'B4','Cell biology',4,4),
((select id from subjects where code='BOTANY'),'B5','Genetics',5,4),
((select id from subjects where code='BOTANY'),'B6','Plant anatomy',6,4),
((select id from subjects where code='BOTANY'),'B7','Plant physiology',7,4),
((select id from subjects where code='BOTANY'),'B8','Developmental botany',8,4),
((select id from subjects where code='BOTANY'),'B9','Applied botany',9,4),
((select id from subjects where code='CHEMISTRY'),'C1','Physical chemistry',1,4),
((select id from subjects where code='CHEMISTRY'),'C2','Inorganic chemistry',2,4),
((select id from subjects where code='CHEMISTRY'),'C3','Organic chemistry',3,4),
((select id from subjects where code='CHEMISTRY'),'C4','Applied chemistry',4,4),
((select id from subjects where code='CHEMISTRY'),'C5','Analytic chemistry',5,4),
((select id from subjects where code='PHYSICS'),'P1','Mechanics',1,4),
((select id from subjects where code='PHYSICS'),'P2','Heat and thermodynamics',2,4),
((select id from subjects where code='PHYSICS'),'P3','Waves and optics',3,4),
((select id from subjects where code='PHYSICS'),'P4','Current electricity and magnetism',4,4),
((select id from subjects where code='PHYSICS'),'P5','Electrostatics and capacitors',5,4),
((select id from subjects where code='PHYSICS'),'P6','Modern physics',6,4),
((select id from subjects where code='MAT'),'M1','Verbal reasoning',1,4),
((select id from subjects where code='MAT'),'M2','Numerical reasoning',2,4),
((select id from subjects where code='MAT'),'M3','Logical sequencing',3,4),
((select id from subjects where code='MAT'),'M4','Spatial relation / Abstract reasoning',4,4);
insert into public.exam_blueprints(exam_group_id,version,question_count,duration_seconds,marks_correct,marks_incorrect,marks_unanswered,qualification_rule,cognitive_distribution,effective_from,published)
values ((select id from exam_groups where code='I'),1,200,10800,1,-0.25,0,'{"type":"PERCENTILE","threshold":50}'::jsonb,'{"RECALL":50,"UNDERSTANDING":30,"APPLICATION":20}'::jsonb,'2026-04-28',true);
insert into public.blueprint_allocations(blueprint_id,subject_id,unit_id,question_count)
select b.id,s.id,u.id,v.count from (values
('Z1',3),('Z2',4),('Z3',4),('Z4',6),('Z5',15),('Z6',4),('Z7',2),('Z8',2),
('B1',2),('B2',9),('B3',4),('B4',5),('B5',6),('B6',3),('B7',6),('B8',2),('B9',3),
('C1',17),('C2',10),('C3',17),('C4',3),('C5',3),
('P1',10),('P2',7),('P3',8),('P4',9),('P5',4),('P6',12),
('M1',5),('M2',5),('M3',5),('M4',5)) as v(code,count)
join units u on u.code=v.code join subjects s on s.id=u.subject_id cross join exam_blueprints b join exam_groups g on g.id=b.exam_group_id and g.code='I' where b.version=1;
do $$ begin if (select sum(question_count) from blueprint_allocations a join exam_blueprints b on b.id=a.blueprint_id join exam_groups g on g.id=b.exam_group_id where g.code='I' and b.version=1) <> 200 then raise exception 'Group I blueprint must total 200'; end if; end $$;
commit;
