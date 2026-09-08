import { redirect } from 'next/navigation';
import { requirePage } from '@/lib/server/auth';
import { check } from '@/lib/server/data';
import { uuidSchema,type AttemptDetail } from '@/lib/contracts';
import { Quiz } from '@/components/quiz';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;uuidSchema.parse(id);const {db}=await requirePage();const detail=check(await db.rpc('get_attempt',{p_attempt:id})) as AttemptDetail;if(detail.attempt.status!=='ACTIVE')redirect(`/results/${id}`);return <Quiz initial={detail}/>;}
