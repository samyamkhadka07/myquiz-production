'use client';
import { useState } from 'react';
import { api } from '@/lib/client-api';
import type { Profile,AcademicRow } from '@/lib/contracts';
export function ProfileForm({profile,programs}:{profile:Profile;programs:AcademicRow[]}){
 const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 async function save(event:React.FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setMessage('');const f=new FormData(event.currentTarget);try{await api('profile','PATCH',{display_name:f.get('name'),timezone:f.get('timezone'),target_score:f.get('target')?Number(f.get('target')):null,exam_program_id:f.get('program')||null});setMessage('Profile saved.');}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 return <form className="card form" onSubmit={save}><label>Name<input name="name" defaultValue={profile.display_name} maxLength={80} required/></label><label>Exam program<select name="program" defaultValue={profile.exam_program_id??''}><option value="">Choose a program</option>{programs.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Target score out of 200<input name="target" type="number" min={0} max={200} step=".25" defaultValue={profile.target_score??''}/></label><label>Timezone<input name="timezone" defaultValue={profile.timezone} required/></label><button className="button" disabled={busy}>{busy?'Saving…':'Save profile'}</button><p role="status">{message}</p></form>;
}
