"use client";
import { useState } from "react";
import { api } from "@/lib/client-api";
import type { QuestionInput, Taxonomy } from "@/lib/contracts";
type Question = QuestionInput & {
  id: string;
  lifecycle: string;
  verification_status: string;
  publication_status: string;
};
type QuestionVersion = {
  id: string;
  version_number: number;
  question_snapshot: Question;
  media_snapshot: Array<{
    media_id: string;
    position: number;
    alt_text: string;
    caption: string | null;
  }>;
  created_at: string;
};
export function QuestionEditor({
  taxonomy: t,
  initial,
}: {
  taxonomy: Taxonomy;
  initial: Question[];
}) {
  const [rows, setRows] = useState(initial);
  const [edit, setEdit] = useState<Question | null>(null);
  const [versions, setVersions] = useState<Record<string, QuestionVersion[]>>({});
  const [subject, setSubject] = useState("");
  const [unit, setUnit] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(new Set<string>());
  async function refresh(n = page) {
    setRows(
      await api<Question[]>(
        `questions?page=${n}&search=${encodeURIComponent(search)}&stage=${stage}`,
      ),
    );
    setPage(n);
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const f = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {};
    for (const key of [
      "question_text",
      "option_a",
      "option_b",
      "option_c",
      "option_d",
      "correct_answer",
      "explanation",
      "subject_id",
      "unit_id",
      "topic_id",
      "difficulty",
      "cognitive_level",
      "source_type",
      "source_document",
      "source_url",
      "source_question_number",
      "exam_program_id",
    ])
      payload[key] = f.get(key) || null;
    for (const key of ["source_year", "source_page"])
      payload[key] = f.get(key) ? Number(f.get(key)) : null;
    payload.option_explanations = Object.fromEntries(
      ["A", "B", "C", "D"].map((k) => [k, String(f.get(`explain_${k}`) ?? "")]),
    );
    payload.provenance = edit?.provenance ?? {};
    try {
      await api(`questions${edit ? `/${edit.id}` : ""}`, edit ? "PATCH" : "POST", payload);
      await refresh(0);
      setEdit(null);
      setMessage(
        "Question saved to staging. Review and verification are required before publication.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function transition(id: string, action: string) {
    setBusy(true);
    try {
      await api(`questions/${id}/transition`, "POST", { action });
      await refresh();
      setMessage(`Question ${action.toLowerCase()} saved.`);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function bulk(action: string) {
    if (!selected.size) return;
    setBusy(true);
    let done = 0;
    try {
      for (const id of selected) {
        await api(`questions/${id}/transition`, "POST", { action });
        done++;
      }
      setMessage(`${done} question${done === 1 ? "" : "s"} updated.`);
      setSelected(new Set());
      await refresh();
    } catch (e) {
      setMessage(`${done} updated before the workflow stopped: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }
  async function loadVersions(id: string) {
    setBusy(true);
    try {
      const history = await api<QuestionVersion[]>(`questions/${id}/versions`);
      setVersions((current) => ({ ...current, [id]: history }));
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function restore(id: string, versionId: string) {
    setBusy(true);
    try {
      await api(`questions/${id}/restore`, "POST", { version_id: versionId });
      await refresh();
      const history = await api<QuestionVersion[]>(`questions/${id}/versions`);
      setVersions((current) => ({ ...current, [id]: history }));
      setMessage(
        "Previous version restored to staging. Verification and publication are required again.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <form
        className="card admin-filter-bar"
        onSubmit={(e) => {
          e.preventDefault();
          void refresh(0).catch((e) => setMessage(e.message));
        }}
      >
        <label>
          Search
          <input
            value={search}
            placeholder="Question text or source"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Status
          <select value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="">All lifecycle states</option>
            {["STAGED", "PENDING_REVIEW", "VERIFIED", "PUBLISHED", "ARCHIVED"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <button className="button">Apply filters</button>
        <div>
          <span className="muted">Results</span>
          <strong>{rows.length}</strong>
        </div>
      </form>
      {selected.size ? (
        <section className="bulk-bar" aria-label="Bulk question actions">
          <strong>{selected.size} selected</strong>
          <button className="button secondary" disabled={busy} onClick={() => void bulk("REVIEW")}>
            Request review
          </button>
          <button className="button secondary" disabled={busy} onClick={() => void bulk("VERIFY")}>
            Verify selected
          </button>
          <button className="button" disabled={busy} onClick={() => void bulk("PUBLISH")}>
            Publish selected
          </button>
          <button className="button secondary" disabled={busy} onClick={() => void bulk("ARCHIVE")}>
            Archive selected
          </button>
          <button className="text-link" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </section>
      ) : null}
      <p role="status">{message}</p>
      <details className="card section" open={!!edit}>
        <summary>{edit ? "Edit question" : "Create a question"}</summary>
        <form className="form section" key={edit?.id ?? "new"} onSubmit={save}>
          <label>
            Question
            <textarea
              name="question_text"
              defaultValue={edit?.question_text}
              required
              maxLength={12000}
            />
          </label>
          {(["A", "B", "C", "D"] as const).map((k) => (
            <div className="grid" key={k}>
              <label>
                Option {k}
                <input
                  name={`option_${k.toLowerCase()}`}
                  defaultValue={edit?.[`option_${k.toLowerCase()}` as "option_a"]}
                  required
                />
              </label>
              <label>
                Explanation for {k}
                <textarea name={`explain_${k}`} defaultValue={edit?.option_explanations[k]} />
              </label>
            </div>
          ))}
          <div className="grid">
            <label>
              Correct answer
              <select name="correct_answer" defaultValue={edit?.correct_answer ?? ""}>
                <option value="">Unconfirmed</option>
                {["A", "B", "C", "D"].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <label>
              Source type
              <select name="source_type" defaultValue={edit?.source_type ?? "MANUAL"}>
                {["MANUAL", "PAST_PAPER", "CSV", "CONTRIBUTION", "AI", "EXTERNAL"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Solution / explanation
            <textarea name="explanation" defaultValue={edit?.explanation ?? ""} />
          </label>
          <div className="grid">
            <label>
              Subject
              <select
                name="subject_id"
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  setUnit("");
                }}
                required
              >
                <option value="">Select subject</option>
                {t.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Unit
              <select
                name="unit_id"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                required
              >
                <option value="">Select unit</option>
                {t.units
                  .filter((u) => u.subject_id === subject)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Topic
              <select name="topic_id" defaultValue={edit?.topic_id ?? ""}>
                <option value="">Unit-level question</option>
                {t.topics
                  .filter((v) => v.unit_id === unit)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Program restriction
              <select name="exam_program_id" defaultValue={edit?.exam_program_id ?? ""}>
                <option value="">Shared within this unit</option>
                {t.programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Difficulty
              <select name="difficulty" defaultValue={edit?.difficulty ?? ""}>
                <option value="">Unassigned</option>
                {["EASY", "MEDIUM", "HARD"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Cognitive level
              <select name="cognitive_level" defaultValue={edit?.cognitive_level ?? ""}>
                <option value="">Unassigned</option>
                {["RECALL", "UNDERSTANDING", "APPLICATION"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          </div>
          {["source_document", "source_url", "source_question_number"].map((k) => (
            <label key={k}>
              {k.replaceAll("_", " ")}
              <input name={k} defaultValue={String(edit?.[k as keyof Question] ?? "")} />
            </label>
          ))}
          <div className="grid">
            {["source_year", "source_page"].map((k) => (
              <label key={k}>
                {k.replaceAll("_", " ")}
                <input
                  type="number"
                  name={k}
                  defaultValue={String(edit?.[k as keyof Question] ?? "")}
                />
              </label>
            ))}
          </div>
          <button className="button" disabled={busy}>
            Save to staging
          </button>
          {edit && (
            <button type="button" className="button secondary" onClick={() => setEdit(null)}>
              Cancel edit
            </button>
          )}
        </form>
      </details>
      {rows.map((q) => (
        <article
          className={`card section question-record ${selected.has(q.id) ? "selected-record" : ""}`}
          key={q.id}
        >
          <div className="top">
            <label className="record-selector">
              <input
                type="checkbox"
                checked={selected.has(q.id)}
                onChange={(e) =>
                  setSelected((current) => {
                    const next = new Set(current);
                    if (e.target.checked) next.add(q.id);
                    else next.delete(q.id);
                    return next;
                  })
                }
              />
              <span>Select question</span>
            </label>
            <p className="badge">
              {q.lifecycle} · {q.difficulty ?? "Difficulty unassigned"}
            </p>
          </div>
          <h2>{q.question_text}</h2>
          <details>
            <summary>Preview options, answer and provenance</summary>
            {(["A", "B", "C", "D"] as const).map((k) => (
              <p key={k}>
                {k}. {q[`option_${k.toLowerCase()}` as "option_a"]}
              </p>
            ))}
            <p>Answer: {q.correct_answer ?? "Unconfirmed"}</p>
            <p>{q.explanation}</p>
            <pre>{JSON.stringify(q.provenance, null, 2)}</pre>
          </details>
          <details
            onToggle={(event) => {
              if (event.currentTarget.open && !versions[q.id]) void loadVersions(q.id);
            }}
          >
            <summary>Version history</summary>
            {!versions[q.id] && <p className="muted">Loading saved versions…</p>}
            {versions[q.id]?.map((version) => (
              <article className="version-record" key={version.id}>
                <div>
                  <strong>Version {version.version_number}</strong>
                  <span className="muted">
                    {" "}
                    · {new Date(version.created_at).toLocaleString()} ·{" "}
                    {version.media_snapshot.length} media item(s)
                  </span>
                </div>
                <p>{version.question_snapshot.question_text}</p>
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void restore(q.id, version.id)}
                >
                  Restore this version to staging
                </button>
              </article>
            ))}
            {versions[q.id]?.length === 0 && (
              <p className="muted">No earlier content version exists yet.</p>
            )}
          </details>
          <div className="toolbar">
            <button
              className="button secondary"
              disabled={busy || q.lifecycle === "PUBLISHED"}
              onClick={() => {
                setEdit(q);
                setSubject(q.subject_id);
                setUnit(q.unit_id);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              Edit
            </button>
            {(q.lifecycle === "STAGED" || q.lifecycle === "VALIDATION_REQUIRED") && (
              <button
                className="button"
                disabled={busy}
                onClick={() => void transition(q.id, "REVIEW")}
              >
                Request review
              </button>
            )}
            {q.lifecycle === "PENDING_REVIEW" && (
              <button
                className="button"
                disabled={busy}
                onClick={() => void transition(q.id, "VERIFY")}
              >
                Verify answer and content
              </button>
            )}
            {q.lifecycle === "VERIFIED" && (
              <button
                className="button"
                disabled={busy}
                onClick={() => void transition(q.id, "PUBLISH")}
              >
                Publish
              </button>
            )}
            {q.lifecycle !== "ARCHIVED" && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void transition(q.id, "ARCHIVE")}
              >
                Archive
              </button>
            )}
          </div>
        </article>
      ))}
      {!rows.length && (
        <section className="card empty-state">
          <h2>No questions match these filters</h2>
          <p>Adjust the search or lifecycle filter.</p>
        </section>
      )}
      <div className="pagination">
        <button
          className="button secondary"
          disabled={page === 0 || busy}
          onClick={() => void refresh(page - 1)}
        >
          Previous
        </button>
        <span>Page {page + 1}</span>
        <button
          className="button secondary"
          disabled={rows.length < 25 || busy}
          onClick={() => void refresh(page + 1)}
        >
          Next
        </button>
      </div>
    </>
  );
}
