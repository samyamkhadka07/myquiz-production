import { NextResponse } from 'next/server';
import { ZodError,z } from 'zod';
import { identity,staff,ApiError } from '@/lib/server/auth';
import { check,taxonomy } from '@/lib/server/data';
import { answerSchema,questionSchema,uuidSchema } from '@/lib/contracts';
import { learningApi } from '@/lib/server/learning-api';
import { exportCsv } from '@/lib/documents/canonical-csv';
export const dynamic='force-dynamic';
async function handle(request:Request,{params}:{params:Promise<{path:string[]}>}){
 const requestId=crypto.randomUUID();
 try {
  const url=new URL(request.url);const method=request.method;const {path}=await params;const [resource,id,operation]=path;
  if(method!=='GET'&&request.headers.get('origin')!==url.origin)throw new ApiError(403,'ORIGIN_REJECTED','This request must come from MyQuiz.');
  const {db,profile}=await identity();
  if(resource==='csv'&&id==='export'&&method==='GET'){
   staff(profile);const questions=check(await db.from('questions').select('*').order('created_at').limit(10000));const csv=exportCsv(questions as never,await taxonomy());
   return new NextResponse(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="myquiz-questions.csv"','Cache-Control':'private, no-store'}});
  }
  const body=method==='GET'?{}:await request.json();
  let data:unknown;
  if(resource==='taxonomy'&&method==='GET')data=await taxonomy();
  else if(resource==='attempts'){
   if(id){uuidSchema.parse(id);
    if(method==='GET')data=check(await db.rpc('get_attempt',{p_attempt:id}));
    else if(operation==='complete'&&method==='POST')data=check(await db.rpc('complete_attempt',{p_attempt:id}));
    else if(operation==='answer'&&method==='POST'){
     const p=z.object({question_id:uuidSchema,answer:answerSchema.nullable(),marked:z.boolean(),revision:z.number().int().nonnegative()}).strict().parse(body);
     data=check(await db.rpc('save_answer',{p_attempt:id,p_question:p.question_id,p_answer:p.answer,p_marked:p.marked,p_revision:p.revision}));
    }else throw new ApiError(405,'METHOD_NOT_ALLOWED','Unsupported attempt operation.');
   }else if(method==='GET'){
    const page=Math.max(0,Number(url.searchParams.get('page'))||0);data=check(await db.from('attempts').select('*').eq('user_id',profile.id).order('started_at',{ascending:false}).range(page*25,page*25+24));
   }else if(method==='POST'){
    const p=z.object({program_id:uuidSchema,mode:z.enum(['FULL','SUBJECT','TOPIC','IMPORTANT','PAST','ADAPTIVE']),count:z.number().int().min(1).max(200),subject_id:uuidSchema.nullable(),topic_id:uuidSchema.nullable(),request_key:uuidSchema}).strict().parse(body);
    data=check(await db.rpc('start_attempt',{p_program:p.program_id,p_mode:p.mode,p_count:p.count,p_subject:p.subject_id,p_topic:p.topic_id,p_request:p.request_key}));
   }else throw new ApiError(405,'METHOD_NOT_ALLOWED','Unsupported method.');
  }else if(resource==='availability'&&method==='GET')data=check(await db.rpc('question_availability',{p_program:uuidSchema.parse(url.searchParams.get('program'))}));
  else if(resource==='bookmarks'){
   if(method==='GET')data=check(await db.rpc('get_bookmarks'));
   else{const p=z.object({question_id:uuidSchema,saved:z.boolean()}).strict().parse(body);data=check(await db.rpc('set_bookmark',{p_question:p.question_id,p_saved:p.saved}));}
  }else if(resource==='profile'&&method==='PATCH'){
   const p=z.object({display_name:z.string().trim().min(1).max(80),target_score:z.number().min(0).max(200).nullable(),timezone:z.string().min(1).max(80),exam_program_id:uuidSchema.nullable()}).strict().parse(body);
   data=check(await db.rpc('update_profile',{p_name:p.display_name,p_target:p.target_score,p_timezone:p.timezone,p_program:p.exam_program_id}));
  }else if(resource==='questions'){
   staff(profile);
   if(method==='GET'){
    const page=Math.max(0,Number(url.searchParams.get('page'))||0);let q=db.from('questions').select('*').order('created_at',{ascending:false}).range(page*25,page*25+24);
    if(id)q=q.eq('id',uuidSchema.parse(id));
    const search=url.searchParams.get('search');if(search)q=q.ilike('question_text',`%${search.slice(0,200).replaceAll(/[%_]/g,'')}%`);
    const stage=url.searchParams.get('stage');if(stage)q=q.eq('lifecycle',z.enum(['STAGED','PENDING_REVIEW','VERIFIED','PUBLISHED','ARCHIVED','VALIDATION_REQUIRED']).parse(stage));
    data=check(await q);
   }else if(operation==='transition'&&method==='POST'){
    const p=z.object({action:z.enum(['REVIEW','VERIFY','PUBLISH','ARCHIVE'])}).strict().parse(body);data=check(await db.rpc('transition_question',{p_id:uuidSchema.parse(id),p_action:p.action}));
   }else if(method==='POST'||method==='PATCH')data=check(await db.rpc('save_question',{p_id:id?uuidSchema.parse(id):null,p_data:questionSchema.parse(body)}));
   else throw new ApiError(405,'METHOD_NOT_ALLOWED','Unsupported question operation.');
  }else {const result=await learningApi(db,profile,path,method,body,url);if(!result)throw new ApiError(404,'NOT_FOUND','This endpoint does not exist.');data=result.data;}
  return NextResponse.json({data,requestId},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){
  const e=error instanceof ApiError?error:error instanceof ZodError?new ApiError(400,'VALIDATION_FAILED',error.issues.map(x=>x.message).join('; ')):new ApiError(500,'INTERNAL_ERROR','The request could not be completed.');
  return NextResponse.json({error:{code:e.code,message:e.message},requestId},{status:e.status,headers:{'Cache-Control':'no-store'}});
 }
}
export {handle as GET,handle as POST,handle as PATCH,handle as DELETE};
