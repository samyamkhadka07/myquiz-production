import { requirePage } from '@/lib/server/auth';
import { check } from '@/lib/server/data';
import { Community } from '@/components/community';
export default async function Page(){const {db,profile}=await requirePage();const rows=check(await db.from('comments').select('*').is('question_id',null).order('created_at',{ascending:false}).limit(50));return <><h1>Study community</h1><p>Ask questions, share a useful explanation and help fellow learners.</p><Community initial={rows} userId={profile.id} staff={profile.role!=='STUDENT'}/></>;}
