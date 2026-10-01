"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client-api";

type Question = {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string | null;
  explanation: string | null;
  option_explanations: Record<string, string>;
  difficulty: string | null;
  cognitive_level: string | null;
  source_type: string;
  source_document: string | null;
  source_page: number | null;
  source_year: number | null;
  extraction_confidence: number | null;
  provenance: Record<string, unknown>;
  lifecycle: string;
  verified_at: string | null;
};

export function QuestionReviewQueue({
  initial,
  mode,
}: {
  initial: Question[];
  mode: "verification" | "publication" | "published";
}) {
  const [rows, setRows] = useState(initial),
    [search, setSearch] = useState(""),
    [source, setSource] = useState("ALL"),
    [selected, setSelected] = useState(new Set<string>()),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const sources = useMemo(() => [...new Set(rows.map((row) => row.source_type))].sort(), [rows]);
  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          (source === "ALL" || row.source_type === source) &&
          (!search ||
            `${row.question_text} ${row.source_document ?? ""}`
              .toLowerCase()
              .includes(search.toLowerCase())),
      ),
    [rows, search, source],
  );
  const action = mode === "verification" ? "VERIFY" : mode === "publication" ? "PUBLISH" : "ARCHIVE";
  async function apply(ids: string[], next = action) {
    if (!ids.length) return;
    if (!window.confirm(`Apply ${next.replaceAll("_", " ").toLowerCase()} to ${ids.length} question${ids.length === 1 ? "" : "s"}? Invalid or ineligible questions will be skipped, not forced through.`)) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ processed: string[]; skipped: Array<{ id: string; reason: string }> }>(
        "questions/bulk",
        "POST",
        { ids, action: next },
      );
      setRows((current) => current.filter((row) => !result.processed.includes(row.id)));
      setSelected(new Set());
      const skipped = result.skipped.length;
      setMessage(
        `${result.processed.length} processed successfully${skipped ? `; ${skipped} skipped. ${result.skipped.slice(0, 3).map((item) => item.reason).join(" | ")}` : "."}`,
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="card admin-filter-bar">
        <label>
          Search
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Question or source document"
          />
        </label>
        <label>
          Source
          <select value={source} onChange={(event) => setSource(event.target.value)}>
            <option>ALL</option>
            {sources.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <div>
          <span className="muted">Ready</span>
          <strong>{filtered.length}</strong>
        </div>
      </section>
      <section className="bulk-bar">
        <strong>{selected.size} selected · {filtered.length} visible</strong>
        <button className="button secondary" disabled={busy || !filtered.length} onClick={() => setSelected(new Set(filtered.map((row) => row.id)))}>
          Select all visible
        </button>
        <button className="button" disabled={busy || !filtered.length} onClick={() => void apply(filtered.map((row) => row.id))}>
          {mode === "verification" ? "Verify all visible" : mode === "publication" ? "Publish all visible" : "Archive all visible"}
        </button>
        {selected.size > 0 && <>
          <button className="button" disabled={busy} onClick={() => void apply([...selected])}>
            {mode === "verification" ? "Verify selected" : mode === "publication" ? "Publish selected" : "Archive selected"}
          </button>
          {mode !== "published" && <button className="button secondary" disabled={busy} onClick={() => void apply([...selected], "ARCHIVE")}>Archive selected</button>}
          <button className="text-link" onClick={() => setSelected(new Set())}>Clear</button>
        </>}
      </section>
      <p
        role="status"
        className={message.includes("successfully") ? "success" : message ? "error" : ""}
      >
        {message}
      </p>
      <div className="review-queue">
        {filtered.map((question) => {
          const options = {
            A: question.option_a,
            B: question.option_b,
            C: question.option_c,
            D: question.option_d,
          };
          const warnings = [
            !question.correct_answer && "Answer key missing",
            !question.explanation && "Solution missing",
            Object.values(question.option_explanations ?? {}).some((value) => !value) &&
              "Option explanations incomplete",
            !question.difficulty && "Difficulty unassigned",
            question.extraction_confidence !== null &&
              question.extraction_confidence < 0.8 &&
              "Low extraction confidence",
          ].filter(Boolean);
          return (
            <article className="card queue-record" key={question.id}>
              <div className="top">
                <label className="record-selector">
                  <input
                    type="checkbox"
                    checked={selected.has(question.id)}
                    onChange={(event) =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(question.id);
                        else next.delete(question.id);
                        return next;
                      })
                    }
                  />
                  <span>Select</span>
                </label>
                <div className="toolbar">
                  <span className="pill">{question.source_type.replaceAll("_", " ")}</span>
                  <span className="pill">{question.difficulty ?? "Difficulty missing"}</span>
                </div>
              </div>
              <h2>{question.question_text}</h2>
              <div className="option-review-grid">
                {Object.entries(options).map(([key, value]) => (
                  <section
                    className={
                      question.correct_answer === key
                        ? "option-explanation correct"
                        : "option-explanation"
                    }
                    key={key}
                  >
                    <strong>
                      {key}. {value}
                    </strong>
                    <small>
                      {question.option_explanations?.[key] ||
                        "No option-specific explanation provided."}
                    </small>
                  </section>
                ))}
              </div>
              <section className="explanation-panel">
                <strong>Verified solution</strong>
                <p>{question.explanation || "No solution has been provided."}</p>
              </section>
              <div className="metadata-row">
                <span>{question.cognitive_level ?? "Cognitive level missing"}</span>
                <span>
                  {question.source_document ?? "Manual entry"}
                  {question.source_page ? ` · page ${question.source_page}` : ""}
                </span>
                {question.source_year && <span>{question.source_year}</span>}
                {question.extraction_confidence !== null && (
                  <span>
                    {Math.round(question.extraction_confidence * 100)}% extraction confidence
                  </span>
                )}
              </div>
              {warnings.length > 0 && (
                <div className="validation-warnings">
                  {warnings.map((warning) => (
                    <span key={String(warning)}>⚠ {warning}</span>
                  ))}
                </div>
              )}
              <div className="toolbar">
                <button
                  className="button"
                  disabled={busy || (mode !== "published" && warnings.length > 0)}
                  onClick={() => void apply([question.id])}
                >
                  {mode === "verification" ? "Verify academic content" : mode === "publication" ? "Publish to student tests" : "Archive published question"}
                </button>
                <Link href={`/admin/questions?edit=${question.id}`} className="button secondary">
                  Open in editor
                </Link>
                {Boolean(question.provenance?.contribution_id) && (
                  <Link href="/admin/contributions" className="text-link">
                    Open original source
                  </Link>
                )}
              </div>
              {mode === "publication" && (
                <p className="muted">
                  Verified{" "}
                  {question.verified_at
                    ? new Date(question.verified_at).toLocaleString()
                    : "previously"}{" "}
                  · publishing updates the canonical question bank.
                </p>
              )}
            </article>
          );
        })}
      </div>
      {!filtered.length && (
        <section className="card empty-state">
          <h2>
            {mode === "verification"
              ? "Review queue is clear"
              : "Nothing is waiting for publication"}
          </h2>
          <p>
            {mode === "verification"
              ? "New extracted or edited questions appear here after validation."
              : "Verified draft questions appear here when they are ready for release."}
          </p>
        </section>
      )}
    </>
  );
}
