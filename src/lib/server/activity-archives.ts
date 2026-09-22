import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { check } from "./data";

const categories = ["ADMIN", "STUDENT"];
type Archive = { id:string; period_start:string; period_end:string; object_path:string; status:string; item_count:number; categories:string[]; generated_at:string|null };
const day = 86_400_000;
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

export function archiveablePeriod(now = new Date(), earliest?: Date) {
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 14));
  const latestEnd = new Date(cutoff.getTime() - day);
  latestEnd.setUTCDate(latestEnd.getUTCDate() - ((latestEnd.getUTCDay() + 6) % 7));
  const first = earliest ?? latestEnd;
  const start = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  return { periodStart: isoDate(start), periodEnd: isoDate(latestEnd) };
}

function pdf(lines: string[]) {
  const escaped=["MyQuiz Activity Archive",...lines].flatMap(line=>line.match(/.{1,84}(?:\s|$)/g)??[line]).map(line=>line.trim().replaceAll("\\","\\\\").replaceAll("(","\\(").replaceAll(")","\\)"));
  const stream=`BT /F1 12 Tf 48 790 Td ${escaped.map((line,index)=>`${index?"0 -18 Td ":""}(${line}) Tj`).join(" ")} ET`;
  const objects=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R] /Count 1 >>","<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let output="%PDF-1.4\n"; const offsets=[0]; objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(output));output+=`${index+1} 0 obj\n${object}\nendobj\n`;}); const start=Buffer.byteLength(output);output+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(offset=>`${String(offset).padStart(10,"0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(output,"utf8");
}

async function rowsForPeriod(db: ReturnType<typeof createAdminClient>, start: string, end: string) {
  const from = `${start}T00:00:00.000Z`, to = `${end}T23:59:59.999Z`;
  const [audit,attempts,games,flashcards,contributions,comments,subscriptions,ai] = await Promise.all([
    db.from("audit_events").select("action").gte("created_at",from).lte("created_at",to),
    db.from("attempts").select("id").in("status",["COMPLETED","EXPIRED"]).gte("completed_at",from).lte("completed_at",to),
    db.from("learning_game_sessions").select("id").eq("status","COMPLETED").gte("completed_at",from).lte("completed_at",to),
    db.from("flashcard_reviews").select("id").gte("reviewed_at",from).lte("reviewed_at",to),
    db.from("contributions").select("id").gte("updated_at",from).lte("updated_at",to),
    db.from("comments").select("id").gte("created_at",from).lte("created_at",to),
    db.from("subscriptions").select("id").gte("updated_at",from).lte("updated_at",to),
    db.from("ai_usage_logs").select("id").gte("created_at",from).lte("created_at",to),
  ]);
  return { audit:check(audit) as {action:string}[], attempts:check(attempts) as {id:string}[], games:check(games) as {id:string}[], flashcards:check(flashcards) as {id:string}[], contributions:check(contributions) as {id:string}[], comments:check(comments) as {id:string}[], subscriptions:check(subscriptions) as {id:string}[], ai:check(ai) as {id:string}[] };
}

export async function generateActivityArchive(periodStart: string, periodEnd: string, generatedBy: string | null = null): Promise<Archive> {
  const db = createAdminClient();
  const existing = await db.from("activity_archives").select("*").eq("period_start",periodStart).eq("period_end",periodEnd).eq("categories",categories).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.status === "COMPLETED") return existing.data as Archive;
  const objectPath = `weekly/${periodStart}_${periodEnd}.pdf`;
  const manifest = existing.data ?? check(await db.from("activity_archives").insert({period_start:periodStart,period_end:periodEnd,categories,object_path:objectPath,generated_by:generatedBy,status:"PENDING"}).select("*").single());
  try {
    const activity = await rowsForPeriod(db,periodStart,periodEnd);
    const counts = Object.entries(activity).map(([name,items]) => [name,items.length] as const);
    const lines = [
      `Archive period: ${periodStart} → ${periodEnd}`, `Generated: ${new Date().toISOString()}`, "",
      "Summary", ...counts.map(([name,count])=>`${name}: ${count}`), "",
      "Admin activity summary", `Moderation, account/role, payment, subscription, publication and security actions: ${activity.audit.length}`,
      "Student activity summary", `Completed tests: ${activity.attempts.length}`, `Learning games: ${activity.games.length}`, `Flashcard reviews: ${activity.flashcards.length}`, `Contributions: ${activity.contributions.length}`, `Community activity: ${activity.comments.length}`, `Subscription events: ${activity.subscriptions.length}`, `AI tutor usage: ${activity.ai.length}`,
    ];
    const contents = pdf(lines); const checksum = createHash("sha256").update(contents).digest("hex");
    const uploaded = await db.storage.from("activity-archives").upload(objectPath,contents,{contentType:"application/pdf",upsert:true}); if (uploaded.error) throw uploaded.error;
    return check(await db.from("activity_archives").update({status:"COMPLETED",item_count:counts.reduce((total,[,count])=>total+count,0),checksum,generated_at:new Date().toISOString(),failure_reason:null}).eq("id",manifest.id).select("*").single()) as Archive;
  } catch (error) {
    await db.from("activity_archives").update({status:"FAILED",failure_reason:error instanceof Error?error.message.slice(0,400):"Archive generation failed"}).eq("id",manifest.id);
    throw error;
  }
}

export async function generateNextActivityArchive(generatedBy: string | null = null) {
  const db = createAdminClient();
  const first = check(await db.from("audit_events").select("created_at").order("created_at").limit(1).maybeSingle()) as {created_at:string}|null;
  if (!first) return null;
  const {periodStart,periodEnd}=archiveablePeriod(new Date(),new Date(first.created_at));
  for(let cursor=new Date(`${periodStart}T00:00:00Z`); cursor<=new Date(`${periodEnd}T00:00:00Z`); cursor=new Date(cursor.getTime()+7*day)){
    const start=isoDate(cursor),end=isoDate(new Date(cursor.getTime()+6*day));
    const found=await db.from("activity_archives").select("id,status").eq("period_start",start).eq("period_end",end).eq("categories",categories).maybeSingle();
    if (!found.data || found.data.status!=="COMPLETED") return generateActivityArchive(start,end,generatedBy);
  }
  return null;
}

export async function signedArchiveUrl(id: string) {
  const db=createAdminClient(); const archive=check(await db.from("activity_archives").select("object_path,status").eq("id",id).eq("status","COMPLETED").single()) as {object_path:string};
  const result=await db.storage.from("activity-archives").createSignedUrl(archive.object_path,300); if(result.error||!result.data?.signedUrl) throw result.error??new Error("Archive unavailable"); return result.data.signedUrl;
}
