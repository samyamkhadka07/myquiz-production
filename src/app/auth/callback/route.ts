import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEnv } from '@/lib/env';
export async function GET(request:Request){
 const url=new URL(request.url);const db=await createClient();const code=url.searchParams.get('code');
 const token=url.searchParams.get('token_hash');const type=url.searchParams.get('type');
 const result=code?await db.auth.exchangeCodeForSession(code):token&&(type==='email'||type==='recovery')?await db.auth.verifyOtp({token_hash:token,type}):null;
 const target=url.searchParams.get('next')==='/reset-password'?'/reset-password':'/dashboard';
 return NextResponse.redirect(new URL(result&&!result.error?target:'/login?error=confirmation',getEnv().NEXT_PUBLIC_APP_URL));
}
