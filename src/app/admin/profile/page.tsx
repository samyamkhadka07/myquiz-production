import {requirePage} from '@/lib/server/auth';
import {taxonomy} from '@/lib/server/data';
import {ProfileForm} from '@/components/profile-form';
export default async function Page(){const {profile}=await requirePage(true);const data=await taxonomy();return <><h1>Admin profile</h1><p>Profile preferences do not control your authoritative role or permissions.</p><ProfileForm profile={profile} programs={data.programs}/></>;}
