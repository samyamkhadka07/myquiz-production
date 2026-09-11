'use client';
import {useState} from 'react';
import {api} from '@/lib/client-api';
import type {Profile} from '@/lib/contracts';
export function AdminProfileForm({profile,email}:{profile:Profile;email:string}){
 const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 async function save(event:React.FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setMessage('');const f=new FormData(event.currentTarget);try{await api('admin-profile','PATCH',{display_name:f.get('name'),timezone:f.get('timezone')});setMessage('Admin profile saved.');}catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
 return <form className="card form" onSubmit={save}><label>Display name<input name="name" defaultValue={profile.display_name} maxLength={80} required/></label><label>Email<input value={email} readOnly aria-readonly="true"/></label><label>Role<input value={profile.role.replace('_',' ')} readOnly aria-readonly="true"/></label>{profile.role==='SUPER_ADMIN'&&<p className="success"><strong>SUPER ADMIN · PROTECTED</strong><br/>This permanent authority cannot be changed by ordinary administrators.</p>}<label>Timezone<input name="timezone" defaultValue={profile.timezone} required/></label><button className="button" disabled={busy}>{busy?'Saving…':'Save admin preferences'}</button><p role="status">{message}</p></form>;
}
