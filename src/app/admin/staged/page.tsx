import { requirePage } from "@/lib/server/auth";
import { check } from "@/lib/server/data";
import { StagedEditor } from "@/components/admin-workflow-actions";
export default async function Page() {
  const { db } = await requirePage(true);
  const rows = check(
    await db
      .from("staged_items")
      .select("*")
      .in("status", ["PENDING_REVIEW", "NEEDS_REVISION", "DUPLICATE"])
      .order("created_at", { ascending: false })
      .limit(100),
  ) as Array<Record<string, unknown>>;
  return (
    <>
      <p className="eyebrow">Ingestion · academic release control</p>
      <h1>Staged questions</h1>
      <p>
        Review extracted candidates in plain academic fields. Nothing becomes student-visible until
        validation, verification and publication succeed.
      </p>
      <section className="stats compact-stats">
        <article className="card">
          <span className="muted">Awaiting review</span>
          <div className="metric">{rows.filter((r) => r.status === "PENDING_REVIEW").length}</div>
        </article>
        <article className="card">
          <span className="muted">Needs revision</span>
          <div className="metric">{rows.filter((r) => r.status === "NEEDS_REVISION").length}</div>
        </article>
        <article className="card">
          <span className="muted">Possible duplicates</span>
          <div className="metric">
            {rows.filter((r) => r.status === "DUPLICATE" || r.duplicate_question_id).length}
          </div>
        </article>
      </section>
      {rows.map((r) => {
        const errors = Array.isArray(r.validation_errors) ? r.validation_errors : [];
        return (
          <details
            className="card section staged-record"
            key={String(r.id)}
            open={errors.length > 0}
          >
            <summary>
              <strong>
                {String(
                  (r.question_data as Record<string, unknown>)?.question_text ??
                    "Untitled extracted question",
                )}
              </strong>{" "}
              · {String(r.status).replaceAll("_", " ")}
            </summary>
            <div className="metadata-row">
              <span>Source page {String(r.source_page ?? "unknown")}</span>
              {Boolean(r.source_row) && <span>CSV row {String(r.source_row)}</span>}
              {Boolean(r.duplicate_question_id) && <span>Possible duplicate detected</span>}
            </div>
            {errors.length > 0 && (
              <div className="validation-warnings">
                {errors.map((error, index) => (
                  <span key={index}>⚠ {String(error)}</span>
                ))}
              </div>
            )}
            <StagedEditor id={String(r.id)} initial={r.question_data as Record<string, unknown>} />
          </details>
        );
      })}
      {!rows.length && (
        <section className="card empty-state">
          <h2>No staged questions need review</h2>
          <p>New document, CSV and authorized-source candidates appear here after processing.</p>
        </section>
      )}
    </>
  );
}
