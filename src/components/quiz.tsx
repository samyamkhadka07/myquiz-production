"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { api } from "@/lib/client-api";
import type { AttemptDetail, AttemptQuestion } from "@/lib/contracts";
import { QuestionMedia } from "@/components/question-media";
export function Quiz({ initial }: { initial: AttemptDetail }) {
  const router = useRouter();
  const [detail, setDetail] = useState(initial);
  const [position, setPosition] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [seconds, setSeconds] = useState(
    Math.max(
      0,
      Math.ceil((Date.parse(initial.attempt.expires_at) - Date.parse(initial.server_time)) / 1000),
    ),
  );
  const completing = useRef(false);
  const question = detail.questions[position];
  const finish = useCallback(async () => {
    if (completing.current) return;
    completing.current = true;
    setBusy(true);
    setError("");
    try {
      await api(`attempts/${detail.attempt.id}/complete`, "POST", {});
      router.replace(`/results/${detail.attempt.id}` as Route);
    } catch (e) {
      setError((e as Error).message);
      completing.current = false;
      setBusy(false);
    }
  }, [detail.attempt.id, router]);
  useEffect(() => {
    const t = setInterval(
      () =>
        setSeconds((previous) => {
          const next = Math.max(0, previous - 1);
          if (next === 0) void finish();
          return next;
        }),
      1000,
    );
    return () => clearInterval(t);
  }, [finish]);
  async function save(answer: AttemptQuestion["selected_answer"], marked: boolean) {
    if (!question) return;
    setBusy(true);
    setError("");
    try {
      await api(`attempts/${detail.attempt.id}/answer`, "POST", {
        question_id: question.question_id,
        answer,
        marked,
        revision: question.revision,
      });
      const fresh = await api<AttemptDetail>(`attempts/${detail.attempt.id}`);
      setDetail(fresh);
      setSeconds(
        Math.max(
          0,
          Math.ceil((Date.parse(fresh.attempt.expires_at) - Date.parse(fresh.server_time)) / 1000),
        ),
      );
      if (fresh.attempt.status !== "ACTIVE")
        router.replace(`/results/${detail.attempt.id}` as Route);
    } catch (e) {
      setError((e as Error).message);
      try {
        setDetail(await api<AttemptDetail>(`attempts/${detail.attempt.id}`));
      } catch {
        /* Retain error until a successful fresh read. */
      }
    } finally {
      setBusy(false);
    }
  }
  if (!question) return <p className="error">No questions are available in this attempt.</p>;
  const answered = detail.questions.filter((q) => q.selected_answer !== null).length;
  return (
    <>
      <div className="top">
        <div>
          <p className="eyebrow">{detail.attempt.mode.toLowerCase()} test</p>
          <h1>
            Question {position + 1} of {detail.questions.length}
          </h1>
        </div>
        <div className={seconds < 60 ? "timer error" : "timer"} aria-label="Time remaining">
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
        </div>
      </div>
      <div className="quiz-grid">
        <section className="card">
          <h2 className="question-text">{question.snapshot.question_text}</h2>
          <QuestionMedia questionId={question.question_id} />
          <fieldset disabled={busy || seconds === 0} className="options">
            <legend className="sr-only">Select one answer</legend>
            {(["A", "B", "C", "D"] as const).map((letter) => (
              <label
                key={letter}
                className={question.selected_answer === letter ? "option selected" : "option"}
              >
                <input
                  type="radio"
                  name="answer"
                  checked={question.selected_answer === letter}
                  onChange={() => void save(letter, question.marked_for_review)}
                />
                <strong>{letter}</strong>
                <span>{question.snapshot[`option_${letter.toLowerCase()}` as "option_a"]}</span>
              </label>
            ))}
          </fieldset>
          <div className="toolbar">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void save(null, question.marked_for_review)}
            >
              Clear answer
            </button>
            <label className="check-label">
              <input
                type="checkbox"
                checked={question.marked_for_review}
                disabled={busy}
                onChange={(e) => void save(question.selected_answer, e.target.checked)}
              />
              Mark for review
            </label>
          </div>
          <p role="status" className={error ? "error" : "muted"}>
            {error || (busy ? "Saving…" : "Answers are saved to your account.")}
          </p>
          <div className="toolbar">
            <button
              className="button secondary"
              disabled={position === 0 || busy}
              onClick={() => setPosition((p) => p - 1)}
            >
              Previous
            </button>
            <button
              className="button"
              disabled={position === detail.questions.length - 1 || busy}
              onClick={() => setPosition((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </section>
        <aside className="card">
          <h2>Question palette</h2>
          <p>
            {answered} answered · {detail.questions.length - answered} unanswered
          </p>
          <div className="palette">
            {detail.questions.map((q, i) => (
              <button
                key={q.question_id}
                disabled={busy}
                aria-label={`Question ${i + 1}, ${q.selected_answer ? "answered" : "unanswered"}${q.marked_for_review ? ", marked for review" : ""}`}
                aria-current={i === position ? "step" : undefined}
                className={`${q.selected_answer ? "answered " : ""}${q.marked_for_review ? "marked" : ""}`}
                onClick={() => setPosition(i)}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <button className="button section" disabled={busy} onClick={() => setConfirm(true)}>
            Submit test
          </button>
          {confirm && (
            <section className="confirmation" aria-label="Confirm submission">
              <p>
                Submit now? {detail.questions.length - answered} questions remain unanswered.
                Submitted answers cannot be changed.
              </p>
              <div className="toolbar">
                <button className="button" disabled={busy} onClick={() => void finish()}>
                  Confirm submission
                </button>
                <button className="button secondary" onClick={() => setConfirm(false)}>
                  Keep working
                </button>
              </div>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
