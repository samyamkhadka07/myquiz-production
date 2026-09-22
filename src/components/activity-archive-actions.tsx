"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client-api";
export function ArchiveActions({periodStart,periodEnd}:{periodStart:string;periodEnd:string}){const router=useRouter();const [message,setMessage]=useState("");return <div className="toolbar"><button className="button secondary" onClick={async()=>{try{await api("activity-archives","POST",{period_start:periodStart,period_end:periodEnd});setMessage("Archive generated.");router.refresh();}catch(e){setMessage((e as Error).message)}}}>Generate missing archive</button><small role="status">{message}</small></div>}
