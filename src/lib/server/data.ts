import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { ApiError } from './auth';
import type { Taxonomy } from '@/lib/contracts';
export function check<T>(r:{data:T|null;error:{message:string;code?:string}|null}):NonNullable<T>{
 if(r.error){const code=r.error.code??'DATABASE_ERROR';const status=code==='42501'?403:code==='P0002'?404:code==='40001'||code==='23505'?409:code==='22023'||code==='P0001'||code.startsWith('23')?400:503;throw new ApiError(status,code,status<500?r.error.message:'The request could not be completed. Please try again.');}
 return r.data as NonNullable<T>;
}
export async function taxonomy():Promise<Taxonomy>{
 const db=await createClient();
 const names=['exam_programs','exam_groups','subjects','units','topics','exam_blueprints','blueprint_allocations'] as const;
 const values=await Promise.all(names.map(name=>db.from(name).select('*').limit(1000)));
 const rows=values.map(v=>check(v));
 return {programs:rows[0],groups:rows[1],subjects:rows[2],units:rows[3],topics:rows[4],blueprints:rows[5],allocations:rows[6]} as unknown as Taxonomy;
}
