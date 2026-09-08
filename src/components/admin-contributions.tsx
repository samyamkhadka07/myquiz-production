'use client';
import {useState} from 'react';
import {api} from '@/lib/client-api';
import {ActionButtons} from '@/components/admin-workflow-actions';
type Row={id:string;original_filename:string;category:string;processing_state:string;review_state:string;error_detail:string|null;uploader_id:string;created_at:string};
export function AdminContributions({initial:rows}:{initial:Row[]}){
 const [message,setMessage]=useState('');
 async function download(id:string){try{const result=await api<{url:string}>(`download/${id}`,'POST',{});window.location.assign(result.url);setMessage('Secure download opened.');}catch(error){setMessage((error as Error).message);}}
 return <><p role="status">{message}</p><div className="table-wrap card"><table><thead><tr><th>Original</th><th>Uploader</th><th>Category</th><th>Processing</th><th>Review</th><th>Actions</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{row.original_filename}<br/><small>{row.error_detail}</small></td><td>{row.uploader_id}</td><td>{row.category}</td><td>{row.processing_state}</td><td>{row.review_state}</td><td><button className="button secondary" onClick={()=>void download(row.id)}>Signed download</button><ActionButtons resource="contribution-review" id={row.id} actions={['APPROVE','NEEDS_REVISION','REJECT']}/></td></tr>)}</tbody></table></div></>;
}
