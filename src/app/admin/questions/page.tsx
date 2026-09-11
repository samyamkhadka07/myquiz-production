import { requirePage } from '@/lib/server/auth';
import { check,taxonomy } from '@/lib/server/data';
import { QuestionEditor } from '@/components/question-editor';
const stages=['STAGED','VALIDATION_REQUIRED','PENDING_REVIEW','VERIFIED','PUBLISHED','ARCHIVED'] as const;
export default async function Page({searchParams}:{searchParams:Promise<{stage?:string}>}){const {db}=await requirePage(true);const requested=(await searchParams).stage;const stage=stages.find(value=>value===requested);const t=await taxonomy();let query=db.from('questions').select('*').order('created_at',{ascending:false}).limit(25);if(stage)query=query.eq('lifecycle',stage);const rows=check(await query);return <><h1>{stage==='PENDING_REVIEW'?'Question verification':stage==='VERIFIED'?'Question publication':'Question bank'}</h1><p>Only verified, published questions enter student tests. Editing requires fresh verification.</p><QuestionEditor taxonomy={t} initial={rows}/></>;}
