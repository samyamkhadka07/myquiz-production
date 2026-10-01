import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { check } from './data';
import {processOne} from './document-worker';
export async function dispatchJob(jobId:string){
 const runId=`request:${jobId}`;
 const db=createAdminClient();
 check(await db.from('processing_jobs').update({workflow_run_id:runId}).eq('id',jobId));
 for(let step=0;step<8;step++){
  const result=await processOne(jobId);
  if(result.done||result.wait>2000) break;
 }
 return runId;
}
