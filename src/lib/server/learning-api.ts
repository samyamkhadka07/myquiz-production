import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { uuidSchema,type Profile } from '@/lib/contracts';
import { check } from './data';
import { ApiError,admin,staff,superAdmin } from './auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { scheduleReview } from '@/lib/flashcards/scheduler';
import { dispatchJob } from './dispatch';
import { generateAI } from './ai';
import {processIngestionRun} from './external-worker';
export async function learningApi(db:SupabaseClient,profile:Profile,path:string[],method:string,body:unknown,url:URL):Promise<{data:unknown}|null>{
 const [resource,id,operation]=path;
 if(resource==='admin-profile'&&method==='PATCH'){
  staff(profile);const p=z.object({display_name:z.string().trim().min(1).max(80),timezone:z.string().trim().min(1).max(100)}).strict().parse(body);
  return {data:check(await db.rpc('update_admin_profile',{p_name:p.display_name,p_timezone:p.timezone}))};
 }
 if(resource==='learning-games'){
  if(method==='GET')return {data:check(await db.from('learning_game_sessions').select('*').eq('user_id',profile.id).order('started_at',{ascending:false}).limit(20))};
  if(operation==='answer'){
   const p=z.object({question_id:uuidSchema,answer:z.enum(['A','B','C','D']),rating:z.enum(['KNEW_IT','ALMOST','DIDNT_KNOW']).nullable(),response_ms:z.number().int().min(0).max(3600000)}).strict().parse(body);
   return {data:check(await db.rpc('answer_learning_game',{p_session:uuidSchema.parse(id),p_question:p.question_id,p_answer:p.answer,p_rating:p.rating,p_response_ms:p.response_ms}))};
  }
  const p=z.object({mode:z.enum(['RAPID_FIRE','RAPID_RECALL','MISTAKE_RESCUE','ACCURACY','DAILY_CHALLENGE']),count:z.number().int().min(1).max(20)}).strict().parse(body);
  if(['MISTAKE_RESCUE','DAILY_CHALLENGE'].includes(p.mode)&&!check(await db.rpc('has_premium')))throw new ApiError(403,'PREMIUM_REQUIRED','This learning mode requires an active Premium entitlement.');
  return {data:check(await db.rpc('start_learning_game',{p_mode:p.mode,p_count:p.count}))};
 }
 if(resource==='study-plan'&&method==='PATCH'){
  const p=z.object({completed:z.boolean()}).strict().parse(body);return {data:check(await db.rpc('set_study_plan_item',{p_id:uuidSchema.parse(id),p_completed:p.completed}))};
 }
 if(resource==='reading-materials'){
  staff(profile);
  if(method==='GET')return {data:check(await db.from('reading_chunks').select('*,contributions(original_filename,category,review_state,object_path)').order('created_at',{ascending:false}).limit(100))};
  const p=z.object({publish:z.boolean()}).strict().parse(body);return {data:check(await db.rpc('review_reading',{p_contribution:uuidSchema.parse(id),p_publish:p.publish}))};
 }
 if(resource==='dashboard'&&method==='GET')return {data:check(await db.rpc('get_dashboard'))};
 if(resource==='leaderboard'){
  if(method==='GET')return {data:check(await db.rpc('leaderboard'))};
  const p=z.object({opt_in:z.boolean()}).strict().parse(body);return {data:check(await db.rpc('set_leaderboard_privacy',{p_opt_in:p.opt_in}))};
 }
 if(resource==='flashcards'){
  if(method==='GET')return {data:check(await db.from('flashcards').select('*').eq('user_id',profile.id).lte('due',new Date().toISOString()).order('due').limit(50))};
  if(operation==='review'){
   const p=z.object({rating:z.union([z.literal(1),z.literal(2),z.literal(3),z.literal(4)]),request_key:uuidSchema}).strict().parse(body);
   const card=check(await db.from('flashcards').select('*').eq('id',uuidSchema.parse(id)).eq('user_id',profile.id).single()) as {id:string;state:Parameters<typeof scheduleReview>[0];due:string;revision:number};
   const result=scheduleReview({...card.state,due:card.due},p.rating,new Date());
   const server=createAdminClient();
   return {data:check(await server.rpc('commit_flashcard_review',{p_user:profile.id,p_card:card.id,p_rating:p.rating,p_state:JSON.parse(JSON.stringify(result.card)),p_log:JSON.parse(JSON.stringify(result.log)),p_revision:card.revision,p_request:p.request_key}))};
  }
  const p=z.object({question_id:uuidSchema}).strict().parse(body);return {data:check(await db.rpc('add_flashcard',{p_question:p.question_id}))};
 }
 if(resource==='comments'){
  if(method==='GET'){
   const page=Math.max(0,Number(url.searchParams.get('page'))||0);
   let query=db.from('comments').select('*').is('question_id',null).order('created_at',{ascending:false}).range(page*50,page*50+49);
   if(id)query=query.eq('id',uuidSchema.parse(id));return {data:check(await query)};
  }
  if(operation==='reaction'){const p=z.object({reaction:z.enum(['HELPFUL','THANKS']).nullable()}).strict().parse(body);return {data:check(await db.rpc('react_comment',{p_comment:uuidSchema.parse(id),p_reaction:p.reaction}))};}
  if(operation==='report'){const p=z.object({reason:z.string().trim().min(3).max(1000)}).strict().parse(body);return {data:check(await db.rpc('report_comment',{p_comment:uuidSchema.parse(id),p_reason:p.reason}))};}
  if(operation==='moderate'){const p=z.object({action:z.enum(['DELETE','HIDE','RESTORE'])}).strict().parse(body);return {data:check(await db.rpc('moderate_comment',{p_comment:uuidSchema.parse(id),p_action:p.action}))};}
  const p=z.object({body:z.string().trim().min(1).max(4000),parent_id:uuidSchema.nullable(),question_id:uuidSchema.nullable()}).strict().parse(body);return {data:check(await db.rpc('write_comment',{p_id:id?uuidSchema.parse(id):null,p_parent:p.parent_id,p_question:p.question_id,p_body:p.body}))};
 }
 if(resource==='contributions'){
  if(method==='GET'){
   let query=db.from('contributions').select('*,processing_jobs(id,status,last_error,updated_at),processing_artifacts(id,page_number,chunk_index,artifact_type,content,data)').order('created_at',{ascending:false}).limit(100);
   if(id)query=query.eq('id',uuidSchema.parse(id));return {data:check(await query)};
  }
  if(operation==='finalize'){
   const p=z.object({size:z.number().int().positive().max(Number.MAX_SAFE_INTEGER)}).strict().parse(body);const server=createAdminClient();
   const job=check(await server.rpc('finalize_contribution',{p_id:uuidSchema.parse(id),p_user:profile.id,p_size:p.size})) as string;
   const runId=await dispatchJob(job);return {data:{job_id:job,run_id:runId}};
  }
  const p=z.object({filename:z.string().min(1).max(255).refine(v=>!/[\/\\\x00-\x1f]/.test(v)),mime:z.enum(['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','text/csv','image/png','image/jpeg']),size:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),category:z.enum(['QUESTIONS','SOLUTIONS','ANSWER_KEYS','NOTES','ESSAYS','READING','PAST_PAPER','MOCK_TEST']),request_key:uuidSchema}).strict().parse(body);
  return {data:check(await db.rpc('create_contribution',{p_filename:p.filename,p_mime:p.mime,p_size:p.size,p_category:p.category,p_request:p.request_key}))};
 }
 if(resource==='reading'&&method==='GET'){
  const search=(url.searchParams.get('q')??'').trim();let q=db.from('reading_chunks').select('id,contribution_id,page_number,chunk_index,content,title,created_at').eq('publication_status','PUBLISHED').order('created_at',{ascending:false}).limit(100);
  if(search)q=q.textSearch('search_vector',search,{type:'websearch'});return {data:check(await q)};
 }
 if(resource==='staged'){
  staff(profile);
  if(method==='GET')return {data:check(await db.from('staged_items').select('*').order('created_at',{ascending:false}).limit(100))};
  const p=z.object({action:z.enum(['IMPORT','IMPORT_VERIFY','IMPORT_PUBLISH','REJECT','NEEDS_REVISION']),data:z.record(z.string(),z.unknown()).nullable()}).strict().parse(body);
  return {data:check(await db.rpc('review_staged_item',{p_id:uuidSchema.parse(id),p_action:p.action,p_data:p.data}))};
 }
 if(resource==='processing'){
  staff(profile);
  if(method==='GET')return {data:check(await db.from('processing_jobs').select('*,contributions(original_filename,category,uploader_id)').order('created_at',{ascending:false}).limit(100))};
  if(operation==='run'){const runId=await dispatchJob(uuidSchema.parse(id));return {data:{run_id:runId}};}
  if(operation==='retry'){check(await db.rpc('retry_job',{p_id:uuidSchema.parse(id)}));const runId=await dispatchJob(uuidSchema.parse(id));return {data:{run_id:runId}};}
 }
 if(resource==='reports'){staff(profile);const p=z.object({action:z.enum(['DISMISS','HIDE','DELETE'])}).strict().parse(body);return {data:check(await db.rpc('resolve_report',{p_id:uuidSchema.parse(id),p_action:p.action}))};}
 if(resource==='contribution-review'){staff(profile);const p=z.object({action:z.enum(['APPROVE','REJECT','NEEDS_REVISION'])}).strict().parse(body);return {data:check(await db.rpc('review_contribution',{p_id:uuidSchema.parse(id),p_action:p.action}))};}
 if(resource==='download'&&method==='POST'){
  staff(profile);const contribution=check(await db.from('contributions').select('id,bucket,object_path').eq('id',uuidSchema.parse(id)).single()) as {id:string;bucket:string;object_path:string};
  const server=createAdminClient();const signed=check(await server.storage.from(contribution.bucket).createSignedUrl(contribution.object_path,120));
  check(await server.from('audit_events').insert({actor_id:profile.id,action:'ORIGINAL_DOWNLOADED',target_type:'contribution',target_id:contribution.id}));
  return {data:{url:signed.signedUrl,expires_in:120}};
 }
 if(resource==='sources'){
  staff(profile);
  if(method==='GET')return {data:check(await db.from('external_sources').select('*,ingestion_runs(*)').order('created_at',{ascending:false}).limit(100))};
  if(operation==='scan'){const run=check(await db.rpc('queue_ingestion',{p_source:uuidSchema.parse(id)})) as string;await processIngestionRun(run);return {data:{run_id:run}};}
  admin(profile);const p=z.object({platform:z.literal('META'),source_type:z.literal('PAGE'),source_identifier:z.string().min(1).max(200),canonical_url:z.url(),label:z.string().min(1).max(200),enabled:z.boolean(),authorization_state:z.enum(['UNVERIFIED','AUTHORIZED','REVOKED','ERROR'])}).strict().parse(body);
  return {data:check(await db.rpc('save_external_source',{p_id:id?uuidSchema.parse(id):null,p_data:p}))};
 }
 if(resource==='learning'&&method==='POST'){
  const p=z.object({activity:z.enum(['EXPLAIN_DIFFERENTLY','RAPID_RECALL','MISTAKE_CORRECTION','MATCHING','CLASSIFICATION']),text:z.string().min(1).max(12000)}).strict().parse(body);
  const instructions={EXPLAIN_DIFFERENTLY:'Explain this verified study content in simpler language. Do not change any stated answer key.',RAPID_RECALL:'Create five brief recall prompts from only the supplied verified content.',MISTAKE_CORRECTION:'Help the learner identify and correct the mistake using only the supplied content.',MATCHING:'Create a compact matching activity from only the supplied verified content.',CLASSIFICATION:'Create a compact classification activity from only the supplied verified content.'}[p.activity];
  try{return {data:{text:await generateAI({instructions,text:p.text,userId:profile.id,purpose:p.activity}),ai:true}};}catch{return {data:{text:'AI assistance is temporarily unavailable. Continue with the verified explanation and review the related flashcard.',ai:false}};}
 }
 if(resource==='users'){
  superAdmin(profile);
  if(method==='GET')return {data:check(await db.from('profiles').select('id,display_name,role,created_at,entitlements(tier,ends_at)').order('created_at',{ascending:false}).limit(100))};
  if(method!=='PATCH')throw new ApiError(405,'METHOD_NOT_ALLOWED','Unsupported user operation.');
  const p=z.object({role:z.enum(['STUDENT','MODERATOR','ADMIN']),tier:z.enum(['FREE','PREMIUM']),ends_at:z.iso.datetime().nullable()}).strict().parse(body);
  return {data:check(await db.rpc('set_user_access',{p_user:uuidSchema.parse(id),p_role:p.role,p_tier:p.tier,p_ends:p.ends_at}))};
 }
 if(resource==='admin-requests'){
  superAdmin(profile);
  if(method==='GET')return {data:check(await db.from('admin_role_requests').select('id,user_id,status,requested_at,reviewed_at,decision_note,profiles!admin_role_requests_user_id_fkey(display_name,role)').order('requested_at',{ascending:false}).limit(100))};
  if(method!=='PATCH')throw new ApiError(405,'METHOD_NOT_ALLOWED','Unsupported admin-request operation.');
  const p=z.object({decision:z.enum(['APPROVE','REJECT']),note:z.string().trim().max(1000).nullable()}).strict().parse(body);
  return {data:check(await db.rpc('review_admin_request',{p_request:uuidSchema.parse(id),p_decision:p.decision,p_note:p.note}))};
 }
 return null;
}
