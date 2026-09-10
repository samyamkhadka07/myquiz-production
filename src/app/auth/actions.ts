'use server';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getEnv } from '@/lib/env';
export type AuthState={message:string;success?:boolean};
const credentials=z.object({email:z.email(),password:z.string().min(12).max(128)});
export async function authenticate(_state:AuthState,form:FormData):Promise<AuthState>{
 const mode=String(form.get('mode'));const email=String(form.get('email')??'').trim();const password=String(form.get('password')??'');
 try {
  const db=await createClient();
  if(mode==='recover'){
   z.email().parse(email);const r=await db.auth.resetPasswordForEmail(email,{redirectTo:`${getEnv().NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`});
   if(r.error)return {message:'Recovery could not be requested. Please try again.'};
   return {message:'If this email is registered, you will receive a password recovery link.',success:true};
  }
  if(mode==='reset'){
   z.string().min(12).max(128).parse(password);const {data:{user}}=await db.auth.getUser();if(!user)return {message:'Open a valid recovery link first.'};
   const r=await db.auth.updateUser({password});if(r.error)return {message:'Password could not be updated. Request a fresh recovery link.'};
   await db.auth.signOut();return {message:'Password updated. You can now sign in.',success:true};
  }
  if(mode==='register'){
   credentials.parse({email,password});const name=z.string().trim().min(1).max(80).parse(form.get('display_name'));
   const requestedAccountType=z.enum(['STUDENT','ADMIN']).parse(form.get('account_type'));
   const r=await db.auth.signUp({email,password,options:{data:{display_name:name,requested_account_type:requestedAccountType},emailRedirectTo:`${getEnv().NEXT_PUBLIC_APP_URL}/auth/callback`}});
   if(r.error)return {message:'Registration could not be completed. Check your details or try password recovery.'};
   if(!r.data.session)return {message:'Check your email to confirm your account, then sign in.',success:true};
  }else if(mode==='login'){
   z.email().parse(email);if(!password)return {message:'Enter your password.'};
   const r=await db.auth.signInWithPassword({email,password});if(r.error)return {message:'Unable to sign in. Check your email, password and email confirmation.'};
  }else return {message:'Invalid authentication request.'};
 }catch(error){return {message:error instanceof z.ZodError?'Check your details. New passwords must contain at least 12 characters.':'Sign-in is temporarily unavailable. Please try again.'};}
 const {data:{user}}=await (await createClient()).auth.getUser();
 if(user){const db=await createClient();const request=await db.from('admin_role_requests').select('status').eq('user_id',user.id).maybeSingle();if(request.data?.status==='PENDING')redirect('/dashboard?admin_request=pending');if(request.data?.status==='REJECTED')redirect('/dashboard?admin_request=rejected');}
 redirect('/dashboard');
}
export async function logout(){const db=await createClient();await db.auth.signOut();redirect('/login');}
