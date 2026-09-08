import 'server-only';
import { start } from 'workflow/api';
import { documentWorkflow } from '@/workflows/documents';
import { createAdminClient } from '@/lib/supabase/admin';
import { check } from './data';
export async function dispatchJob(jobId:string){
 const run=await start(documentWorkflow,[jobId]);const db=createAdminClient();check(await db.from('processing_jobs').update({workflow_run_id:run.runId}).eq('id',jobId));return run.runId;
}
