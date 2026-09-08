import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import fs from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
// The harness models Supabase's auth/storage schemas; application SQL is unmodified.
// @ts-expect-error JavaScript test harness intentionally excluded from application types.
import { database,asUser } from './database.mjs';
let db:PGlite;let program:string;let subject:string;let unit:string;let question:string;let attempt:string;
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',admin='33333333-3333-4333-8333-333333333333';
const as=(id:string,query:string,params:unknown[]=[])=>asUser(db,id,query,params) as Promise<{rows:Record<string,unknown>[]} >;
beforeAll(async()=>{
 db=await database();await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,'student-a@test.invalid','{\"role\":\"ADMIN\"}'),($2,'student-b@test.invalid','{}'),($3,'admin@test.invalid','{}')",[a,b,admin]);
 await db.query("update profiles set role='ADMIN' where id=$1",[admin]);
 program=(await db.query<{id:string}>("select id from exam_programs where code='MBBS'")).rows[0]!.id;
 const row=(await db.query<{id:string;subject_id:string}>("select id,subject_id from units where code='Z1'")).rows[0]!;unit=row.id;subject=row.subject_id;
});
afterAll(async()=>{await db?.close();});
describe.sequential('migration, lifecycle, quiz and isolation evidence',()=>{
 it('runs all migrations, then re-seeds without duplicating academic records',async()=>{const before=(await db.query('select count(*) from topics')).rows;await db.exec(fs.readFileSync('supabase/migrations/0006_mec_complete_seed.sql','utf8'));expect((await db.query('select count(*) from topics')).rows).toEqual(before);expect((await db.query('select count(*)::int n from exam_programs')).rows[0]).toEqual({n:16});});
 it('ignores role metadata on registration',async()=>expect((await as(a,'select role from profiles where id=auth.uid()')).rows[0]?.role).toBe('STUDENT'));
 it('blocks direct self promotion and admin RPC abuse',async()=>{await expect(as(a,"update profiles set role='ADMIN' where id=auth.uid()")).rejects.toThrow();await expect(as(a,"select set_user_access($1,'ADMIN','PREMIUM',null)",[a])).rejects.toThrow();});
 it('blocks anonymous access to protected operations',async()=>{await db.exec('set role anon');try{await expect(db.query("select start_attempt($1,'TOPIC',1,null,null,gen_random_uuid())",[program])).rejects.toThrow();await expect(db.query('select * from attempt_question_keys')).rejects.toThrow();}finally{await db.exec('reset role');}});
 it('creates and persists a staged canonical question',async()=>{
 const p={question_text:'TEST FIXTURE: select the first symbol.',option_a:'Alpha',option_b:'Beta',option_c:'Gamma',option_d:'Delta',correct_answer:'A',explanation:'Fixture explanation.',option_explanations:{A:'First',B:'Second',C:'Third',D:'Fourth'},subject_id:subject,unit_id:unit,difficulty:'EASY',cognitive_level:'RECALL',source_type:'MANUAL'};
 question=(await as(admin,'select save_question(null,$1::jsonb) id',[JSON.stringify(p)])).rows[0]!.id as string;
 expect((await as(admin,'select lifecycle from questions where id=$1',[question])).rows[0]?.lifecycle).toBe('STAGED');
 await expect(as(admin,'select save_question(null,$1::jsonb)',[JSON.stringify(p)])).rejects.toThrow(/unique|duplicate/i);
 });
 it('does not let students see any canonical answer rows',async()=>expect((await as(a,'select * from questions')).rows).toHaveLength(0));
 it('requires review and verification before publication',async()=>{await expect(as(admin,"select transition_question($1,'PUBLISH')",[question])).rejects.toThrow();await as(admin,"select transition_question($1,'REVIEW')",[question]);await as(admin,"select transition_question($1,'VERIFY')",[question]);await as(admin,"select transition_question($1,'PUBLISH')",[question]);});
 it('fails a full test honestly when the blueprint cannot be filled',async()=>await expect(as(a,"select start_attempt($1,'FULL',200,null,null,gen_random_uuid())",[program])).rejects.toThrow(/Not enough/));
 it('persists server selection and retries idempotently',async()=>{const key='44444444-4444-4444-8444-444444444444';attempt=(await as(a,"select start_attempt($1,'SUBJECT',1,$2,null,$3) id",[program,subject,key])).rows[0]!.id as string;expect((await as(a,"select start_attempt($1,'SUBJECT',1,$2,null,$3) id",[program,subject,key])).rows[0]!.id).toBe(attempt);expect((await as(a,'select * from attempt_questions where attempt_id=$1',[attempt])).rows).toHaveLength(1);});
 it('does not expose the answer key or explanations during an active test',async()=>{const detail=(await as(a,'select get_attempt($1) detail',[attempt])).rows[0]!.detail;expect(JSON.stringify(detail)).not.toContain('correct_answer');expect(JSON.stringify(detail)).not.toContain('Fixture explanation');await expect(as(a,'select * from attempt_question_keys')).rejects.toThrow();});
 it('rejects Student B access to Student A attempt, answer or completion',async()=>{expect((await as(b,'select * from attempts where id=$1',[attempt])).rows).toHaveLength(0);expect((await as(b,'select * from attempt_questions where attempt_id=$1',[attempt])).rows).toHaveLength(0);await expect(as(b,'select get_attempt($1)',[attempt])).rejects.toThrow();await expect(as(b,"select save_answer($1,$2,'A',false,0)",[attempt,question])).rejects.toThrow();await expect(as(b,'select complete_attempt($1)',[attempt])).rejects.toThrow();});
 it('blocks direct scoring and answer tampering',async()=>{await expect(as(a,'update attempts set score=200 where id=$1',[attempt])).rejects.toThrow();await expect(as(a,"update attempt_questions set selected_answer='A' where attempt_id=$1",[attempt])).rejects.toThrow();});
 it('persists an answer and detects stale answer revisions',async()=>{await as(a,"select save_answer($1,$2,'B',true,0)",[attempt,question]);expect((await as(a,'select selected_answer,marked_for_review,revision from attempt_questions where attempt_id=$1',[attempt])).rows[0]).toEqual({selected_answer:'B',marked_for_review:true,revision:1});await expect(as(a,"select save_answer($1,$2,'A',false,0)",[attempt,question])).rejects.toThrow(/refresh/);});
 it('scores using immutable snapshots even if the original is archived',async()=>{await as(admin,"select transition_question($1,'ARCHIVE')",[question]);await as(a,'select complete_attempt($1)',[attempt]);expect((await as(a,'select score::float,incorrect_count,status from attempts where id=$1',[attempt])).rows[0]).toEqual({score:-.25,incorrect_count:1,status:'COMPLETED'});const r=await as(a,'select get_attempt($1) detail',[attempt]);expect(JSON.stringify(r)).toContain('Fixture explanation');});
 it('completion is idempotent and forbids later answers',async()=>{await as(a,'select complete_attempt($1)',[attempt]);await expect(as(a,"select save_answer($1,$2,'A',false,1)",[attempt,question])).rejects.toThrow(/ended/);});
 it('persists bookmarks across identity changes and isolates ownership',async()=>{await as(a,'select set_bookmark($1,true)',[question]);expect((await as(b,'select * from bookmarks')).rows).toHaveLength(0);expect((await as(a,'select * from bookmarks')).rows).toHaveLength(1);expect(JSON.stringify(await as(a,'select get_bookmarks()'))).toContain(question);});
});
