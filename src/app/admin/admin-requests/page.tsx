import {requirePage,superAdmin} from '@/lib/server/auth';
import {check} from '@/lib/server/data';
import {createAdminClient} from '@/lib/supabase/admin';
import {AdminRequestActions} from '@/components/admin-workflow-actions';

type Request={id:string;user_id:string;status:string;requested_at:string;reviewed_at:string|null;decision_note:string|null;profiles:{display_name:string;role:string}|null};
export default async function Page(){
 const {db,profile}=await requirePage(true);superAdmin(profile);
 const rows=check(await db.from('admin_role_requests').select('id,user_id,status,requested_at,reviewed_at,decision_note,profiles!admin_role_requests_user_id_fkey(display_name,role)').order('requested_at',{ascending:false}).limit(100)) as unknown as Request[];
 const auth=await createAdminClient().auth.admin.listUsers({page:1,perPage:1000});
 const emails=new Map((auth.data?.users??[]).map(user=>[user.id,user.email??'Email unavailable']));
 return <><h1>Admin requests / approvals</h1><p>Choosing Admin during registration creates a non-privileged request. Only the Super Admin can approve it.</p>{rows.length===0&&<p className="card">No Admin access requests.</p>}{rows.map(row=><article className="card section" key={row.id}><h2>{row.profiles?.display_name??'User'} · {row.status}</h2><p>{emails.get(row.user_id)??'Email unavailable'}</p><p>Current role: {row.profiles?.role??'Unknown'} · Requested {new Date(row.requested_at).toLocaleString()}</p>{row.status==='PENDING'?<AdminRequestActions id={row.id}/>:<p className="muted">{row.decision_note||`Reviewed ${row.reviewed_at?new Date(row.reviewed_at).toLocaleString():'previously'}`}</p>}</article>)}</>;
}
