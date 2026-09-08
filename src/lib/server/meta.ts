import 'server-only';
import {createHash} from 'node:crypto';
export type MetaItem={id:string;message?:string;permalink_url?:string;created_time?:string;attachments?:{data:Array<{media?:{image?:{src?:string}};target?:{id?:string}}>}};
export async function fetchMetaPage(pageId:string,cursor?:string){
 const token=process.env.META_GRAPH_ACCESS_TOKEN;if(!token)throw new Error('META_NOT_CONFIGURED');
 const url=new URL(`https://graph.facebook.com/v23.0/${encodeURIComponent(pageId)}/feed`);
 url.searchParams.set('fields','id,message,permalink_url,created_time,attachments{media,target}');
 url.searchParams.set('limit','25');url.searchParams.set('access_token',token);if(cursor)url.searchParams.set('after',cursor);
 const response=await fetch(url,{signal:AbortSignal.timeout(15000),cache:'no-store'});
 if(!response.ok)throw new Error(`META_HTTP_${response.status}`);
 const payload=await response.json() as {data:MetaItem[];paging?:{cursors?:{after?:string}}};
 return {items:payload.data.map(item=>({...item,fingerprint:createHash('sha256').update(`${item.id}|${item.message??''}`).digest('hex')})),cursor:payload.paging?.cursors?.after??null};
}
