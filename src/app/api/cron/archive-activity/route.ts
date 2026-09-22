import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { generateNextActivityArchive } from "@/lib/server/activity-archives";
export async function GET(request:Request){const env=getEnv();if(!env.CRON_SECRET||request.headers.get("authorization")!==`Bearer ${env.CRON_SECRET}`)return NextResponse.json({error:"unauthorized"},{status:401});try{const archive=await generateNextActivityArchive();return NextResponse.json({archive_id:archive?.id??null,status:archive?.status??"UP_TO_DATE"});}catch{return NextResponse.json({error:"archive_generation_failed"},{status:500});}}
