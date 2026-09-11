import Link from 'next/link';
import type { Route } from 'next';
import { logout } from '@/app/auth/actions';
import type { Profile,Role } from '@/lib/contracts';

type AdminLink={label:string;href:string;roles:Role[]};
const allStaff:Role[]=['MODERATOR','ADMIN','SUPER_ADMIN'];
const admins:Role[]=['ADMIN','SUPER_ADMIN'];
const superAdmins:Role[]=['SUPER_ADMIN'];
const navigation:AdminLink[]=[
 {label:'Admin Dashboard',href:'/admin',roles:allStaff},
 {label:'Question Management',href:'/admin/questions',roles:allStaff},
 {label:'Question Verification',href:'/admin/questions?stage=PENDING_REVIEW',roles:allStaff},
 {label:'Question Publication',href:'/admin/questions?stage=VERIFIED',roles:allStaff},
 {label:'MEC Taxonomy & Blueprints',href:'/admin/taxonomy',roles:admins},
 {label:'Users & Roles',href:'/admin/users',roles:superAdmins},
 {label:'Admin Requests / Approvals',href:'/admin/admin-requests',roles:superAdmins},
 {label:'Contributions',href:'/admin/contributions',roles:allStaff},
 {label:'Document Processing',href:'/admin/processing',roles:allStaff},
 {label:'Staged Questions',href:'/admin/staged',roles:allStaff},
 {label:'Reading Materials',href:'/admin/contributions',roles:allStaff},
 {label:'CSV Import / Export',href:'/admin/csv',roles:admins},
 {label:'Comments / Moderation',href:'/admin/moderation',roles:allStaff},
 {label:'Reports',href:'/admin/moderation',roles:allStaff},
 {label:'External Sources',href:'/admin/sources',roles:admins},
 {label:'Ingestion Runs',href:'/admin/sources#ingestion-runs',roles:admins},
 {label:'AI Review / Usage',href:'/admin/analytics',roles:admins},
 {label:'Admin Analytics',href:'/admin/analytics',roles:admins},
 {label:'Audit / Activity',href:'/admin/audit',roles:superAdmins},
 {label:'Admin Profile',href:'/admin/profile',roles:allStaff},
];

export function AdminShell({profile,children}:{profile:Profile;children:React.ReactNode}){
 const links=navigation.filter(item=>item.roles.includes(profile.role));
 return <div className="shell admin-shell"><aside className="side admin-side"><Link href="/admin" className="brand">MY<span>QUIZ</span></Link><p className="admin-title">ADMINISTRATION</p><p className="side-caption">MEC CEE management</p><nav className="nav" aria-label="Administration navigation">{links.map(item=><Link key={`${item.href}-${item.label}`} href={item.href as Route}>{item.label}</Link>)}</nav><div className="admin-side-actions"><form action={logout}><button className="button secondary">Sign out</button></form></div></aside><main className="main" id="main-content"><div className="account-line"><span>{profile.display_name}</span><strong>{profile.role.replace('_',' ')}</strong></div>{children}</main></div>;
}
