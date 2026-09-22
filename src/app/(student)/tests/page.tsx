import Link from 'next/link';
import type { Route } from 'next';
import { requirePage } from '@/lib/server/auth';
import { check,taxonomy } from '@/lib/server/data';
import { TestPicker } from '@/components/test-picker';
export default async function Page({searchParams}:{searchParams:Promise<{mode?:string}>}){const {mode}=await searchParams;const {db,profile}=await requirePage();const t=await taxonomy();const active=check(await db.from('attempts').select('id').eq('user_id',profile.id).eq('status','ACTIVE').limit(1));return <><p className="eyebrow">Syllabus-based practice</p><h1>Tests & practice</h1>{active[0]&&<p className="card">You have an unfinished test. <Link href={`/quiz/${active[0].id}` as Route} className="text-link">Resume it</Link></p>}<TestPicker taxonomy={t} preferred={profile.exam_program_id} initialMode={mode}/></>;}
