import { requirePage } from '@/lib/server/auth';
import { check } from '@/lib/server/data';
import { Leaderboard } from '@/components/leaderboard';
export default async function Page(){const {db,profile}=await requirePage();const data=check(await db.rpc('leaderboard'));const privacy=check(await db.from('profiles').select('leaderboard_opt_in').eq('id',profile.id).single()) as {leaderboard_opt_in:boolean};return <><h1>Leaderboard</h1><p>Compare opt-in learning progress using safe aggregates only—never individual answers, mistakes or private history.</p><Leaderboard initial={data} optIn={privacy.leaderboard_opt_in}/></>;}
