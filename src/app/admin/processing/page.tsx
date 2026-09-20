import { requirePage } from "@/lib/server/auth";
import { check } from "@/lib/server/data";
import { ActionButtons } from "@/components/admin-workflow-actions";
import { processingPosition, processingProgress } from "@/lib/processing/progress";
export default async function Page() {
  const { db } = await requirePage(true);
  const rows = check(
    await db
      .from("processing_jobs")
      .select(
        "*,contributions(original_filename,category),processing_artifacts(id,page_number,chunk_index,artifact_type,created_at)",
      )
      .order("created_at", { ascending: false })
      .limit(100),
  ) as Array<Record<string, unknown>>;
  const count = (states: string[]) => rows.filter((r) => states.includes(String(r.status))).length;
  return (
    <>
      <p className="eyebrow">Ingestion · processing health</p>
      <h1>Document processing</h1>
      <p>
        Follow each document from secure upload to extracted content. Failed work resumes from its
        saved position and the original file is retained.
      </p>
      <section className="stats compact-stats">
        <article className="card">
          <span className="muted">Waiting</span>
          <div className="metric">{count(["READY", "RETRY"])}</div>
        </article>
        <article className="card">
          <span className="muted">Running</span>
          <div className="metric">{count(["RUNNING"])}</div>
        </article>
        <article className="card">
          <span className="muted">Completed</span>
          <div className="metric">{count(["SUCCEEDED"])}</div>
        </article>
        <article className="card">
          <span className="muted">Attention needed</span>
          <div className="metric">{count(["FAILED", "NEEDS_REVIEW", "DEAD_LETTER"])}</div>
        </article>
      </section>
      <div className="processing-list">
        {rows.map((r) => {
          const contribution = r.contributions as Record<string, unknown> | null,
            status = String(r.status),
            cursor = (r.cursor ?? {}) as Record<string, unknown>,
            artifacts = Array.isArray(r.processing_artifacts) ? r.processing_artifacts : [],
            step = String(cursor.step ?? (status === "SUCCEEDED" ? "DONE" : "HASH")),
            progress = processingProgress(status, cursor),
            lastError = r.last_error as Record<string, unknown> | null;
          return (
            <article className="card processing-record" key={String(r.id)}>
              <div className="top">
                <div>
                  <span className="pill">{status.replaceAll("_", " ")}</span>
                  <h2>{String(contribution?.original_filename ?? "Document")}</h2>
                  <p className="muted">
                    {String(contribution?.category ?? "Material")} · updated{" "}
                    {new Date(String(r.updated_at)).toLocaleString()}
                  </p>
                </div>
                <strong>{progress}%</strong>
              </div>
              <div className="game-progress" aria-label={`${progress}% processed`}>
                <i style={{ width: `${progress}%` }} />
              </div>
              <div className="record-grid">
                <div>
                  <span>Current work</span>
                  <strong>
                    {step === "DONE"
                      ? "Processing complete"
                      : step.replaceAll("_", " ").toLowerCase()}
                  </strong>
                </div>
                <div>
                  <span>Attempts</span>
                  <strong>
                    {String(r.step_attempts ?? 0)} / {String(r.max_attempts ?? "—")}
                  </strong>
                </div>
                <div>
                  <span>Extracted items</span>
                  <strong>{artifacts.length}</strong>
                </div>
                <div>
                  <span>Saved checkpoint</span>
                  <strong>{processingPosition(cursor)}</strong>
                </div>
                <div>
                  <span>Worker</span>
                  <strong>{r.lease_token ? "Active now" : "Available"}</strong>
                </div>
              </div>
              {lastError && (
                <p className="error">
                  {String(lastError.message ?? "Processing needs administrator review.")}
                </p>
              )}
              <ActionButtons
                resource="processing"
                id={String(r.id)}
                actions={
                  ["READY", "RETRY"].includes(status)
                    ? ["run"]
                    : ["FAILED", "NEEDS_REVIEW", "DEAD_LETTER"].includes(status)
                      ? ["retry"]
                      : []
                }
              />
            </article>
          );
        })}
      </div>
      {!rows.length && (
        <section className="card empty-state">
          <h2>No processing jobs</h2>
          <p>Finalizing a contribution creates a processing job automatically.</p>
        </section>
      )}
    </>
  );
}
