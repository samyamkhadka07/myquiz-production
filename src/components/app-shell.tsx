import Link from 'next/link';
import type { Route } from 'next';
import type { Profile } from '@/lib/contracts';
import { logout } from '@/app/auth/actions';
const navigation=[['Dashboard','/dashboard'],['Tests & practice','/tests'],['History','/history'],['Bookmarks','/bookmarks'],['Flashcards','/flashcards'],['Study plan','/recommendations'],['Leaderboard','/leaderboard'],['Achievements','/achievements'],['Learning games','/games'],['Community','/community'],['Contributions','/contributions'],['Reading room','/reading'],['Profile','/profile']];
export function AppShell({profile,children}:{profile:Profile;children:React.ReactNode}){
 return <div className="shell"><aside className="side"><Link href="/dashboard" className="brand">MY<span>QUIZ</span></Link><p className="side-caption">MEC CEE preparation</p><nav className="nav" aria-label="Main navigation">{navigation.map(([name,path])=><Link key={path} href={path as Route}>{name}</Link>)}{profile.role!=='STUDENT'&&<Link href={'/admin' as Route}>Administration</Link>}</nav><form action={logout}><button className="button secondary">Sign out</button></form></aside><main className="main" id="main-content"><div className="account-line"><span>{profile.display_name}</span><span>{profile.role.toLowerCase()}</span></div>{children}</main></div>;
}
