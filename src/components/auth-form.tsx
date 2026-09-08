'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { authenticate } from '@/app/auth/actions';
export function AuthForm({mode}:{mode:'login'|'register'|'recover'|'reset'}){
 const [state,action,pending]=useActionState(authenticate,{message:''});
 const title={login:'Welcome back',register:'Create your account',recover:'Recover your password',reset:'Choose a new password'}[mode];
 return <main className="auth-page"><Link href="/" className="brand">MY<span>QUIZ</span></Link><section className="card"><p className="eyebrow">MEC CEE preparation</p><h1>{title}</h1><form action={action} className="form"><input type="hidden" name="mode" value={mode}/>{mode==='register'&&<label>Name<input name="display_name" required maxLength={80} autoComplete="name"/></label>}{mode!=='reset'&&<label>Email<input type="email" name="email" required autoComplete="email"/></label>}{mode!=='recover'&&<label>Password<input type="password" name="password" required minLength={mode==='login'?1:12} maxLength={128} autoComplete={mode==='login'?'current-password':'new-password'}/>{mode!=='login'&&<small>Use at least 12 characters.</small>}</label>}{state.message&&<p role="status" className={state.success?'success':'error'}>{state.message}</p>}<button className="button" disabled={pending}>{pending?'Please wait…':{login:'Sign in',register:'Create account',recover:'Send recovery link',reset:'Update password'}[mode]}</button></form><div className="inline-links"><Link href="/login">Sign in</Link><Link href="/register">Create account</Link><Link href="/recover">Forgot password?</Link></div></section></main>;
}
