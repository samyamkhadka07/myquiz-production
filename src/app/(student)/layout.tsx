import { requirePage } from '@/lib/server/auth';
import { AppShell } from '@/components/app-shell';
import { isStaffRole } from '@/lib/auth/role-routing';
import { redirect } from 'next/navigation';
export const dynamic='force-dynamic';
export default async function Layout({children}:{children:React.ReactNode}){const {profile}=await requirePage();if(isStaffRole(profile.role))redirect('/admin');return <AppShell profile={profile}>{children}</AppShell>;}
