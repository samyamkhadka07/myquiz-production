'use client';
import { useState } from 'react';
import { api } from '@/lib/client-api';
type Ranking={full_access:boolean;entries:{id:string;display_name:string;xp:number;rank:number}[]};
export function Leaderboard({initial,optIn}:{initial:Ranking;optIn:boolean}){
 const [data,setData]=useState(initial);const [opt,setOpt]=useState(optIn);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 async function change(value:boolean){setBusy(true);try{await api('leaderboard','PATCH',{opt_in:value});setData(await api<Ranking>('leaderboard'));setOpt(value);}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 return <><label className="check-label"><input type="checkbox" checked={opt} disabled={busy} onChange={e=>void change(e.target.checked)}/>Show my display name on the leaderboard</label>{!data.full_access&&<p className="card section">Free access shows your own entry. Comparing other opted-in learners requires Premium access.</p>}<p role="status">{message}</p><div className="card table-wrap"><table><thead><tr><th>Rank</th><th>Learner</th><th>XP</th></tr></thead><tbody>{data.entries.map(e=><tr key={e.id}><td>{e.rank}</td><td>{e.display_name}</td><td>{e.xp}</td></tr>)}</tbody></table></div></>;
}
