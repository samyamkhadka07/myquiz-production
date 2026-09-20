"use client";
import { useState } from "react";
import { api } from "@/lib/client-api";
import type { AttemptDetail } from "@/lib/contracts";
import { QuestionMedia } from "@/components/question-media";
import { SourceMetadata } from "@/components/source-metadata";
export function Review({ detail, saved }: { detail: AttemptDetail; saved: string[] }) {
  const [filter, setFilter] = useState("ALL");
  const [bookmarks, setBookmarks] = useState(new Set(saved));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [alternate, setAlternate] = useState<Record<string, string>>({});
  async function assist(
    questionId: string,
    activity: "EXPLAIN_DIFFERENTLY" | "EXPLAIN_DEEPER" | "GENERATE_MNEMONIC" | "SIMILAR_QUESTION",
    text: string,
  ) {
    setBusy(questionId);
    setError("");
    try {
      const response = await api<{ text: string }>("learning", "POST", { activity, text });
      setAlternate((value) => ({ ...value, [questionId]: response.text }));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function bookmark(id: string) {
    setBusy(id);
    try {
      const state = await api<boolean>("bookmarks", "POST", {
        question_id: id,
        saved: !bookmarks.has(id),
      });
      setBookmarks((prev) => {
        const next = new Set(prev);
        if (state) next.add(id);
        else next.delete(id);
        return next;
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <section>
      <div className="top review-heading">
        <div>
          <p className="eyebrow">Learn from every option</p>
          <h2>Detailed answer review</h2>
        </div>
        <label>
          Show
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            {["ALL", "CORRECT", "INCORRECT", "UNANSWERED", "MARKED"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {detail.questions
        .filter(
          (q) =>
            filter === "ALL" ||
            (filter === "CORRECT" && q.is_correct) ||
            (filter === "INCORRECT" && q.is_correct === false) ||
            (filter === "UNANSWERED" && q.selected_answer === null) ||
            (filter === "MARKED" && q.marked_for_review),
        )
        .map((q) => {
          const provenance = q.provenance ?? {};
          const source = String(
            provenance.source_document ?? provenance.source ?? "Verified MyQuiz question bank",
          );
          const year = provenance.source_year ? String(provenance.source_year) : null;
          const mnemonic = typeof provenance.mnemonic === "string" ? provenance.mnemonic : null;
          return (
            <article className="card section review-card" key={q.question_id}>
              <div className="top">
                <span className={`pill ${q.is_correct ? "" : "attention"}`}>
                  Question {q.position} ·{" "}
                  {q.selected_answer == null
                    ? "Unanswered"
                    : q.is_correct
                      ? "Correct"
                      : "Needs review"}
                </span>
                <button
                  className="button secondary"
                  disabled={busy === q.question_id}
                  onClick={() => void bookmark(q.question_id)}
                >
                  {bookmarks.has(q.question_id) ? "Remove bookmark" : "Bookmark for revision"}
                </button>
              </div>
              <h3>{q.snapshot.question_text}</h3>
              <QuestionMedia questionId={q.question_id} />
              <div className="answer-summary">
                <div>
                  <span>Your answer</span>
                  <strong>{q.selected_answer ?? "Unanswered"}</strong>
                </div>
                <div>
                  <span>Correct answer</span>
                  <strong>{q.correct_answer}</strong>
                </div>
                <div>
                  <span>Time spent</span>
                  <strong>{Math.round((q.response_ms ?? 0) / 1000)}s</strong>
                </div>
                <div>
                  <span>Difficulty</span>
                  <strong>{q.snapshot.difficulty}</strong>
                </div>
              </div>
              <div className="review-options">
                {(["A", "B", "C", "D"] as const).map((k) => {
                  const selected = q.selected_answer === k,
                    correct = q.correct_answer === k;
                  return (
                    <article
                      className={`review-option ${correct ? "correct-option" : selected ? "wrong-option" : ""}`}
                      key={k}
                    >
                      <div>
                        <strong>
                          {k}. {q.snapshot[`option_${k.toLowerCase()}` as "option_a"]}
                        </strong>
                        <span>
                          {correct
                            ? "Correct option"
                            : selected
                              ? "Your selected option"
                              : "Alternative option"}
                        </span>
                      </div>
                      <p>
                        <strong>
                          {correct ? "Why this is correct" : "Why this is not correct"}:
                        </strong>{" "}
                        {q.option_explanations?.[k] ||
                          "A separate verified option explanation is not available yet."}
                      </p>
                    </article>
                  );
                })}
              </div>
              <section
                className={
                  q.is_correct ? "success learning-explanation" : "error learning-explanation"
                }
              >
                <strong>
                  {q.is_correct ? "Why your answer works" : "What to correct in your thinking"}
                </strong>
                <p>{q.explanation}</p>
              </section>
              {alternate[q.question_id] && (
                <section className="ai-explanation section">
                  <p className="eyebrow">AI explanation · answer key locked</p>
                  <h3>Personal learning assistance</h3>
                  <p>{alternate[q.question_id]}</p>
                </section>
              )}
              {mnemonic ? (
                <section className="mnemonic-box">
                  <strong>Memory cue</strong>
                  <p>{mnemonic}</p>
                </section>
              ) : null}
              <div className="review-meta">
                <span>{q.snapshot.cognitive_level}</span>
                <span>Topic ID: {q.snapshot.topic_id ?? "Unit-level"}</span>
                <span>
                  {source}
                  {year ? ` · ${year}` : ""}
                </span>
              </div>
              <div className="toolbar">
                <button
                  className="button secondary"
                  disabled={busy === q.question_id}
                  onClick={async () => {
                    setBusy(q.question_id);
                    try {
                      await api("flashcards", "POST", { question_id: q.question_id });
                      setError("Flashcard added to your review queue.");
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy("");
                    }
                  }}
                >
                  Add flashcard
                </button>
                <button
                  className="button secondary"
                  disabled={busy === q.question_id}
                  onClick={async () => {
                    setBusy(q.question_id);
                    try {
                      const response = await api<{ text: string }>("learning", "POST", {
                        activity: "EXPLAIN_DIFFERENTLY",
                        text: `Question: ${q.snapshot.question_text}\nVerified answer: ${q.correct_answer}\nVerified explanation: ${q.explanation}`,
                      });
                      setAlternate((v) => ({ ...v, [q.question_id]: response.text }));
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy("");
                    }
                  }}
                >
                  Explain differently
                </button>
                <button
                  className="button secondary"
                  disabled={busy === q.question_id}
                  onClick={() =>
                    void assist(
                      q.question_id,
                      "EXPLAIN_DEEPER",
                      `Question: ${q.snapshot.question_text}\nVerified answer: ${q.correct_answer}\nVerified explanation: ${q.explanation}`,
                    )
                  }
                >
                  Explain deeper
                </button>
                <button
                  className="button secondary"
                  disabled={busy === q.question_id}
                  onClick={() =>
                    void assist(
                      q.question_id,
                      "GENERATE_MNEMONIC",
                      `Question: ${q.snapshot.question_text}\nVerified answer: ${q.correct_answer}\nVerified explanation: ${q.explanation}`,
                    )
                  }
                >
                  Generate mnemonic
                </button>
                <button
                  className="button secondary"
                  disabled={busy === q.question_id}
                  onClick={() =>
                    void assist(
                      q.question_id,
                      "SIMILAR_QUESTION",
                      `Question: ${q.snapshot.question_text}\nVerified answer: ${q.correct_answer}\nVerified explanation: ${q.explanation}`,
                    )
                  }
                >
                  Related practice question
                </button>
                <a className="button" href="/tests">
                  Practice this concept
                </a>
                <a className="button secondary" href="/mistakes">
                  Open Mistake Center
                </a>
              </div>
              <SourceMetadata provenance={q.provenance} />
            </article>
          );
        })}
    </section>
  );
}
