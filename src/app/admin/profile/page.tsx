import {requirePage} from '@/lib/server/auth';
import {AdminProfileForm} from '@/components/admin-profile-form';
export default async function Page(){const {profile,user}=await requirePage(true);return <><h1>Admin profile</h1><p>Administrative identity and preferences. Role authority is read-only and comes from PostgreSQL.</p><AdminProfileForm profile={profile} email={user.email??''}/></>;}
