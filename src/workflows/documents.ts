import { sleep } from 'workflow';
export async function documentWorkflow(jobId:string){
 'use workflow';
 for(let i=0;i<100;i++){
  const result=await documentStep(jobId);if(result.done)return;
  await sleep(result.wait);
 }
 await continueDocument(jobId);
}
async function documentStep(jobId:string){
 'use step';
 const {processOne}=await import('@/lib/server/document-worker');return processOne(jobId);
}
async function continueDocument(jobId:string){
 'use step';
 const {start}=await import('workflow/api');await start(documentWorkflow,[jobId]);
}
