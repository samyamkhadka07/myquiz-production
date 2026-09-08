import Link from 'next/link';
import type { Route } from 'next';
import { requirePage } from '@/lib/server/auth';
import { AppShell } from '@/components/app-shell';
export const dynamic='force-dynamic';
export default async function Layout({children}:{children:React.ReactNode}){const {profile}=await requirePage(true);return <AppShell profile={profile}><nav className="admin-nav toolbar" aria-label="Administration">{['','questions','taxonomy','users','moderation','contributions','processing','staged','csv','sources','analytics'].map(p=><Link href={`/admin${p?`/${p}`:''}` as Route} key={p}>{p||'Overview'}</Link>)}</nav>{children}</AppShell>;}
