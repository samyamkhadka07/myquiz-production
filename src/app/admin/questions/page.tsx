import { requirePage } from '@/lib/server/auth';
import { check,taxonomy } from '@/lib/server/data';
import { QuestionEditor } from '@/components/question-editor';
export default async function Page(){const {db}=await requirePage(true);const t=await taxonomy();const rows=check(await db.from('questions').select('*').order('created_at',{ascending:false}).limit(25));return <><h1>Question bank</h1><p>Only verified, published questions enter student tests. Editing requires fresh verification.</p><QuestionEditor taxonomy={t} initial={rows}/></>;}
