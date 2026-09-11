import { requirePage,ApiError } from '@/lib/server/auth';

async function total(query:PromiseLike<{error:{message:string}|null;count:number|null}>){const result=await query;if(result.error)throw new ApiError(503,'DATABASE_ERROR','Administrative metrics are temporarily unavailable.');return result.count??0;}

export default async function Page(){
 const {db,profile}=await requirePage(true);
 const pending=profile.role==='SUPER_ADMIN'?total(db.from('admin_role_requests').select('id',{count:'exact',head:true}).eq('status','PENDING')):Promise.resolve<number|null>(null);
 const metrics=await Promise.all([
  total(db.from('profiles').select('id',{count:'exact',head:true})),total(db.from('profiles').select('id',{count:'exact',head:true}).eq('role','STUDENT')),total(db.from('profiles').select('id',{count:'exact',head:true}).in('role',['ADMIN','SUPER_ADMIN'])),pending,
  total(db.from('questions').select('id',{count:'exact',head:true}).eq('publication_status','PUBLISHED')),total(db.from('questions').select('id',{count:'exact',head:true}).in('lifecycle',['STAGED','PENDING_REVIEW','VALIDATION_REQUIRED'])),
  total(db.from('contributions').select('id',{count:'exact',head:true})),total(db.from('contributions').select('id',{count:'exact',head:true}).eq('review_state','PENDING')),total(db.from('processing_jobs').select('id',{count:'exact',head:true}).in('status',['FAILED','DEAD_LETTER','NEEDS_REVIEW'])),
  total(db.from('comment_reports').select('id',{count:'exact',head:true}).eq('status','OPEN')),total(db.from('external_sources').select('id',{count:'exact',head:true}).eq('enabled',true)),total(db.from('ingestion_runs').select('id',{count:'exact',head:true})),total(db.from('attempts').select('id',{count:'exact',head:true}).eq('status','COMPLETED')),
 ]);
 const labels=['Total users','Students','Admins','Pending admin approvals','Published questions','Staged / pending questions','Contributions','Contributions awaiting review','Failed / review jobs','Pending reports','Active external sources','Ingestion runs','Completed tests'];
 return <><p className="eyebrow">Role-authorized administration</p><h1>Admin Dashboard</h1><p>Live operational totals from PostgreSQL. No student performance fixture data is displayed.</p><div className="stats admin-stats">{labels.map((label,index)=>metrics[index]===null?null:<section className="card" key={label}><p>{label}</p><div className="metric">{metrics[index]}</div></section>)}</div></>;
}
