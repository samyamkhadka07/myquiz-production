import { requirePage, admin } from "@/lib/server/auth";
import { check } from "@/lib/server/data";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function ActivityArchivesPage() {
  const { db, profile } = await requirePage(true); admin(profile);
  const rows = check(await db.from("activity_archives").select("id,period_start,period_end,categories,item_count,generated_at,object_path").order("period_end", { ascending: false }).limit(100)) as Array<{id:string;period_start:string;period_end:string;categories:string[];item_count:number;generated_at:string;object_path:string}>;
  const storage=createAdminClient().storage.from("activity-archives");
  const signed=await Promise.all(rows.map(async row=>({row,url:(await storage.createSignedUrl(row.object_path,300)).data?.signedUrl??null})));
  return <><h1>Activity archives</h1><p>Private PDF summaries for activity older than the active 14-day window.</p>{signed.length?<div className="table-wrap card"><table><thead><tr><th>Period</th><th>Categories</th><th>Items</th><th>Generated</th><th>PDF</th></tr></thead><tbody>{signed.map(({row,url})=><tr key={row.id}><td>{row.period_start} → {row.period_end}</td><td>{row.categories.join(", ")}</td><td>{row.item_count}</td><td>{new Date(row.generated_at).toLocaleString()}</td><td>{url?<a className="button secondary" href={url}>Download PDF</a>:"Unavailable"}</td></tr>)}</tbody></table></div>:<section className="card empty-state"><h2>No archives yet</h2><p>The secure daily archive job creates an archive only after activity crosses the 14-day boundary.</p></section>}</>;
}
