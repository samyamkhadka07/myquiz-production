import { requirePage } from "@/lib/server/auth";
import { check, taxonomy } from "@/lib/server/data";
import { QuestionEditor } from "@/components/question-editor";
import { ContributionUpload } from "@/components/contribution-upload";
const stages = [
  "STAGED",
  "VALIDATION_REQUIRED",
  "PENDING_REVIEW",
  "VERIFIED",
  "PUBLISHED",
  "ARCHIVED",
] as const;
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const { db } = await requirePage(true);
  const requested = (await searchParams).stage;
  const stage = stages.find((value) => value === requested);
  const t = await taxonomy();
  let query = db.from("questions").select("*").order("created_at", { ascending: false }).limit(25);
  if (stage) query = query.eq("lifecycle", stage);
  const [rows, staged] = await Promise.all([
    query,
    db
      .from("staged_items")
      .select("id,status,validation_errors,created_at")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);
  return (
    <>
      <p className="eyebrow">Academic content · canonical authoring</p>
      <h1>Question Management</h1>
      <p>
        Create, search and maintain canonical questions. Academic verification and student
        publication remain deliberate separate steps.
      </p>
      <details className="card section import-workspace">
        <summary>
          <strong>Import questions from canonical CSV</strong>
        </summary>
        <p>
          Upload → validate → inspect row errors → stage → verify → publish. Invalid rows never
          silently enter student tests.
        </p>
        <ContributionUpload
          initial={[]}
          compact
          defaultCategory="QUESTIONS"
          accept=".csv,text/csv"
        />
        <div className="import-results">
          <h3>Recent staged import results</h3>
          {check(staged).map((row) => (
            <div className="health-row" key={row.id}>
              <span>{row.status.replaceAll("_", " ")}</span>
              <strong>
                {Array.isArray(row.validation_errors) ? row.validation_errors.length : 0} validation
                issues
              </strong>
            </div>
          ))}
          {!staged.data?.length && <p className="muted">No CSV rows have been staged yet.</p>}
        </div>
      </details>
      <QuestionEditor taxonomy={t} initial={check(rows)} />
    </>
  );
}
