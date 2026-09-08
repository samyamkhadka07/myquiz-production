import { redirect } from 'next/navigation';
import { requirePage } from '@/lib/server/auth';
import { check } from '@/lib/server/data';
import { uuidSchema,type AttemptDetail } from '@/lib/contracts';
import { Review } from '@/components/review';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;uuidSchema.parse(id);const {db,profile}=await requirePage();const d=check(await db.rpc('get_attempt',{p_attempt:id})) as AttemptDetail;if(d.attempt.status==='ACTIVE')redirect(`/quiz/${id}`);const saved=check(await db.from('bookmarks').select('question_id').eq('user_id',profile.id));return <><p className="eyebrow">Saved test result</p><h1>{d.attempt.score} / {d.attempt.max_score}</h1><p>{d.attempt.correct_count} correct · {d.attempt.incorrect_count} incorrect · {d.attempt.unanswered_count} unanswered</p><p className="muted">{d.attempt.status==='EXPIRED'?'Time expired. ':''}This practice score is not an MEC percentile or qualification decision.</p><Review detail={d} saved={saved.map(s=>s.question_id)}/></>;}
