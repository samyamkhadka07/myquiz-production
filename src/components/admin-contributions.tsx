'use client';

import {useMemo,useState} from 'react';
import {api} from '@/lib/client-api';
import {ActionButtons} from '@/components/admin-workflow-actions';

type Row={id:string;original_filename:string;category:string;processing_state:string;review_state:string;error_detail:string|null;uploader_id:string;created_at:string;declared_size?:number;mime_type?:string};
const pageSize=20;

export function AdminContributions({initial:rows}:{initial:Row[]}){
 const [message,setMessage]=useState(''),[search,setSearch]=useState(''),[processing,setProcessing]=useState('ALL'),[review,setReview]=useState('ALL'),[page,setPage]=useState(0);
 const filtered=useMemo(()=>rows.filter(row=>(!search||`${row.original_filename} ${row.uploader_id} ${row.category}`.toLowerCase().includes(search.toLowerCase()))&&(processing==='ALL'||row.processing_state===processing)&&(review==='ALL'||row.review_state===review)),[rows,search,processing,review]);
 const visible=filtered.slice(page*pageSize,(page+1)*pageSize);
 const stats:[string,number][]=[['Resources',rows.length],['Awaiting review',rows.filter(row=>['PENDING','PENDING_REVIEW','NEEDS_REVISION'].includes(row.review_state)).length],['Processing',rows.filter(row=>['READY','RUNNING','RETRY'].includes(row.processing_state)).length],['Errors',rows.filter(row=>Boolean(row.error_detail)||['FAILED','DEAD_LETTER'].includes(row.processing_state)).length]];
 const reset=()=>setPage(0);
 async function download(id:string){try{const result=await api<{url:string}>(`download/${id}`,'POST',{});window.location.assign(result.url);setMessage('Audited short-lived download opened.');}catch(error){setMessage((error as Error).message);}}
 return <>
  <section className="stats admin-stats compact-stats">{stats.map(([label,value])=><article className="card metric-card" key={label}><span className="muted">{label}</span><div className="metric">{value}</div></article>)}</section>
  <form className="card admin-filter-bar" onSubmit={event=>event.preventDefault()}><label>Search<input value={search} placeholder="Filename, uploader or category" onChange={event=>{setSearch(event.target.value);reset()}}/></label><label>Processing<select value={processing} onChange={event=>{setProcessing(event.target.value);reset()}}><option>ALL</option>{[...new Set(rows.map(row=>row.processing_state))].map(value=><option key={value}>{value}</option>)}</select></label><label>Review<select value={review} onChange={event=>{setReview(event.target.value);reset()}}><option>ALL</option>{[...new Set(rows.map(row=>row.review_state))].map(value=><option key={value}>{value}</option>)}</select></label><div><span className="muted">Results</span><strong>{filtered.length}</strong></div></form>
  <p role="status" className={message.toLowerCase().includes('error')?'error':''}>{message}</p>
  <div className="contribution-list">{visible.map(row=><article className="card contribution-record" key={row.id}><div className="top"><div><div className="queue-meta"><span className="pill">{row.category}</span><span className="pill">{row.processing_state}</span><span className={`pill ${row.review_state.includes('PENDING')?'attention':''}`}>{row.review_state}</span></div><h2>{row.original_filename}</h2><p className="muted">Uploaded {new Date(row.created_at).toLocaleString()} · {row.mime_type??'Stored original'}{row.declared_size?` · ${(row.declared_size/1024/1024).toFixed(1)} MB`:''}</p></div><button className="button secondary" onClick={()=>void download(row.id)}>Download original</button></div><div className="record-grid"><div><span>Contributor</span><strong>{row.uploader_id}</strong></div><div><span>OCR / extraction</span><strong>{row.processing_state}</strong></div><div><span>Review decision</span><strong>{row.review_state}</strong></div><div><span>Errors</span><strong>{row.error_detail??'None recorded'}</strong></div></div><details><summary>Preview resource metadata</summary><pre>{JSON.stringify({id:row.id,filename:row.original_filename,category:row.category,processing:row.processing_state,review:row.review_state},null,2)}</pre></details><ActionButtons resource="contribution-review" id={row.id} actions={['APPROVE','NEEDS_REVISION','REJECT']}/></article>)}</div>
  {!visible.length?<section className="card empty-state"><h2>No resources match these filters</h2><p>Clear a filter or wait for a student contribution to be finalized.</p></section>:null}
  <div className="pagination"><button className="button secondary" disabled={page===0} onClick={()=>setPage(value=>value-1)}>Previous</button><span>Page {page+1} of {Math.max(1,Math.ceil(filtered.length/pageSize))}</span><button className="button secondary" disabled={(page+1)*pageSize>=filtered.length} onClick={()=>setPage(value=>value+1)}>Next</button></div>
 </>;
}
