import { AuthForm } from '@/components/auth-form';
export default async function Page({searchParams}:{searchParams:Promise<{account?:string}>}){const query=await searchParams;return <AuthForm mode="login" initialMessage={query.account==='deactivated'?'Your account has been deactivated. Contact the administrator if you believe this is a mistake.':undefined}/>;}
