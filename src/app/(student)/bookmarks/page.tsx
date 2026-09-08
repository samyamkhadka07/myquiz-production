import Link from 'next/link';
import type { Route } from 'next';
import { requirePage } from '@/lib/server/auth';
import { check } from '@/lib/server/data';
export default async function Page(){const {db}=await requirePage();const rows=check(await db.rpc('get_bookmarks')) as {question_id:string;attempt_id:string;snapshot:{question_text:string}}[];return <><h1>Bookmarks</h1>{!rows.length&&<p className="card">Bookmark questions from a completed test to return to them here.</p>}{rows.map(q=><article className="card section" key={q.question_id}><h2>{q.snapshot.question_text}</h2><Link href={`/results/${q.attempt_id}` as Route} className="text-link">Open saved review</Link></article>)}</>;}
