import Link from 'next/link';
import type { Route } from 'next';
import { requirePage } from '@/lib/server/auth';
import { AppShell } from '@/components/app-shell';
export const dynamic='force-dynamic';
export default async function Layout({children}:{children:React.ReactNode}){const {profile}=await requirePage(true);const pages=['','questions','taxonomy','moderation','contributions','processing','staged','csv','sources','analytics'];if(profile.role==='SUPER_ADMIN')pages.splice(3,0,'users');return <AppShell profile={profile}><nav className="admin-nav toolbar" aria-label="Administration">{pages.map(p=><Link href={`/admin${p?`/${p}`:''}` as Route} key={p}>{p||'Overview'}</Link>)}</nav>{children}</AppShell>;}
