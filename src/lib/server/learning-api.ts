import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { uuidSchema,type Profile } from '@/lib/contracts';
import { check } from './data';
import { ApiError,admin } from './auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { scheduleReview } from '@/lib/flashcards/scheduler';
export async function learningApi(db:SupabaseClient,profile:Profile,path:string[],method:string,body:unknown,url:URL):Promise<{data:unknown}|null>{
 const [resource,id,operation]=path;
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
 if(resource==='users'){
  admin(profile);
  if(method==='GET')return {data:check(await db.from('profiles').select('id,display_name,role,created_at,entitlements(tier,ends_at)').order('created_at',{ascending:false}).limit(100))};
  if(method!=='PATCH')throw new ApiError(405,'METHOD_NOT_ALLOWED','Unsupported user operation.');
  const p=z.object({role:z.enum(['STUDENT','MODERATOR','ADMIN']),tier:z.enum(['FREE','PREMIUM']),ends_at:z.iso.datetime().nullable()}).strict().parse(body);
  return {data:check(await db.rpc('set_user_access',{p_user:uuidSchema.parse(id),p_role:p.role,p_tier:p.tier,p_ends:p.ends_at}))};
 }
 return null;
}
