import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { check } from './data';
import {processOne} from './document-worker';
export async function dispatchJob(jobId:string){
 const runId=`postgres-cron:${jobId}`;const db=createAdminClient();check(await db.from('processing_jobs').update({workflow_run_id:runId}).eq('id',jobId));await processOne(jobId);return runId;
}
