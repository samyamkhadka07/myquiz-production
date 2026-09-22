"use client";
import {useRouter} from "next/navigation";
import {api} from "@/lib/client-api";
export function NotificationActions({id}:{id:string}){const r=useRouter();return <span className="toolbar"><button className="button secondary" onClick={async()=>{await api(`subscription-notifications/${id}`,"POST",{action:"READ"});r.refresh();}}>Mark read</button><button className="button secondary" onClick={async()=>{await api(`subscription-notifications/${id}`,"POST",{action:"DISMISS"});r.refresh();}}>Dismiss</button></span>}
export function SendSubscriptionWarning({subscriptionId,type}:{subscriptionId:string;type:string}){const r=useRouter();return <button className="button secondary" onClick={async()=>{await api("subscription-notification-send","POST",{subscription_id:subscriptionId,notification_type:type,message:null});r.refresh();}}>Send notification</button>}
