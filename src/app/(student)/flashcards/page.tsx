import { requirePage } from '@/lib/server/auth';
import { check } from '@/lib/server/data';
import { Flashcards,type Flashcard } from '@/components/flashcards';
export default async function Page(){const {db,profile}=await requirePage();const rows=check(await db.from('flashcards').select('*').eq('user_id',profile.id).lte('due',new Date().toISOString()).order('due').limit(50));return <><h1>Flashcards</h1><p>Recall the answer before revealing it, then rate how difficult it was.</p><Flashcards initial={rows as Flashcard[]}/></>;}
