import { requirePage } from '@/lib/server/auth';
import { taxonomy,check } from '@/lib/server/data';
import { ProfileForm } from '@/components/profile-form';
export default async function Page(){const {profile,db}=await requirePage();const t=await taxonomy();const ent=check(await db.from('entitlements').select('tier,ends_at').eq('user_id',profile.id).single()) as {tier:'FREE'|'PREMIUM';ends_at:string|null};return <><h1>Your profile</h1><p>Account role: {profile.role} · Access: {ent.tier}{ent.ends_at?` until ${new Date(ent.ends_at).toLocaleDateString()}`:''}</p><ProfileForm profile={profile} programs={t.programs}/></>;}
