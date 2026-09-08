export async function api<T>(path:string,method='GET',body?:unknown):Promise<T>{
 const res=await fetch(`/api/${path}`,{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,cache:'no-store'});
 const payload=await res.json();if(!res.ok)throw new Error(payload.error?.message??'Request failed. Please try again.');return payload.data as T;
}
