import { requirePage } from '@/lib/server/auth';
import { AppShell } from '@/components/app-shell';
export const dynamic='force-dynamic';
export default async function Layout({children}:{children:React.ReactNode}){const {profile}=await requirePage();return <AppShell profile={profile}>{children}</AppShell>;}
