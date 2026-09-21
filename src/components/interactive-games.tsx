"use client";
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client-api";
import { QuestionMedia } from "@/components/question-media";
type Mode =
  | "RAPID_FIRE"
  | "RAPID_RECALL"
  | "MEMORY_MATCH"
  | "SPEED_CHALLENGE"
  | "MISTAKE_RESCUE"
  | "ACCURACY"
  | "DAILY_CHALLENGE";
type Item = {
  question_id: string;
  position: number;
  snapshot: {
    question_text: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    difficulty: string;
    topic_id: string | null;
  };
};
type Session = { id: string; mode: Mode; question_count: number; items: Item[] };
type Result = {
  correct: boolean;
  correct_answer: string;
  explanation: string;
  completed: boolean;
  completed_count: number;
  correct_count: number;
};
type Summary = {
  mode: Mode;
  title: string;
  questionCount: number;
  correctCount: number;
  responseTimes: number[];
};
type HubMode = {
  mode?: Mode;
  title: string;
  purpose: string;
  count?: number;
  premium?: boolean;
  href?: string;
  skill: string;
};
const modes: HubMode[] = [
  {
    mode: "SPEED_CHALLENGE",
    title: "Rapid Fire",
    purpose: "Ten quick retrieval questions with immediate feedback and an accuracy-first combo.",
    count: 10,
    skill: "Retrieval speed",
  },
  {
    href: "/flashcards?sprint=1",
    title: "Flashcard Sprint",
    purpose: "Clear today’s due FSRS cards with Again, Hard, Good and Easy ratings.",
    skill: "Long-term memory",
  },
  {
    mode: "MISTAKE_RESCUE",
    title: "Mistake Rescue",
    purpose: "Revisit questions you previously missed and repair the underlying concept.",
    count: 8,
    premium: true,
    skill: "Misconception repair",
  },
  {
    mode: "RAPID_FIRE",
    title: "Speed Challenge",
    purpose: "A paced session that trains fast recognition without changing official test scores.",
    count: 15,
    skill: "Accurate pacing",
  },
  {
    mode: "MEMORY_MATCH",
    title: "Memory Match",
    purpose: "Recall the concept first, reveal the choices, then rate how well you knew it.",
    count: 8,
    skill: "Active recall",
  },
  {
    href: "/tests?mode=ADAPTIVE",
    title: "Adaptive Challenge",
    purpose: "Start a question session guided by your current weak-topic priorities.",
    premium: true,
    skill: "Personalized practice",
  },
  {
    mode: "DAILY_CHALLENGE",
    title: "Daily Challenge",
    purpose: "A short verified question mix that records today’s learning activity.",
    count: 10,
    premium: true,
    skill: "Daily consistency",
  },
  {
    href: "/recommendations?challenge=weekly",
    title: "Weekly Challenge",
    purpose: "Complete the week’s recommended practice, mistake and flashcard goals.",
    skill: "Study consistency",
  },
  {
    mode: "ACCURACY",
    title: "Accuracy Mode",
    purpose: "Untimed, low-pressure practice focused on careful correctness.",
    count: 10,
    skill: "Careful reasoning",
  },
];
function titleForMode(mode: Mode) {
  return (
    modes.find((entry) => entry.mode === mode)?.title ??
    (mode === "RAPID_RECALL" ? "Rapid Recall" : mode.replaceAll("_", " "))
  );
}
export function InteractiveGames({
  history,
  tier,
}: {
  history: Array<{
    id: string;
    mode: string;
    status: string;
    correct_count: number;
    question_count: number;
    started_at: string;
  }>;
  tier: "FREE" | "PREMIUM";
}) {
  const [session, setSession] = useState<Session | null>(null),
    [index, setIndex] = useState(0),
    [selected, setSelected] = useState(""),
    [result, setResult] = useState<Result | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [revealed, setRevealed] = useState(false),
    [rating, setRating] = useState<"KNEW_IT" | "ALMOST" | "DIDNT_KNOW" | null>(null),
    [started, setStarted] = useState(0),
    [seconds, setSeconds] = useState(20),
    [sessionSeconds, setSessionSeconds] = useState(0),
    [responseTimes, setResponseTimes] = useState<number[]>([]),
    [summary, setSummary] = useState<Summary | null>(null);
  const item = session?.items[index];
  const timed = session?.mode === "RAPID_FIRE" || session?.mode === "SPEED_CHALLENGE";
  const speedChallenge = session?.mode === "SPEED_CHALLENGE";
  const recall = session?.mode === "RAPID_RECALL";
  const memoryMatch = session?.mode === "MEMORY_MATCH";
  useEffect(() => {
    if (!timed || !item || result) return;
    const timer = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [timed, item, result]);
  useEffect(() => {
    if (!speedChallenge || !item || result || sessionSeconds <= 0) return;
    const timer = setInterval(() => setSessionSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [speedChallenge, item, result, sessionSeconds]);
  const combo = useMemo(() => (result?.correct ? result.correct_count : 0), [result]);
  async function start(mode: Mode, count: number, eventTime: number) {
    setBusy(true);
    setMessage("");
    try {
      const data = await api<Session>("learning-games", "POST", { mode, count });
      setSession(data);
      setIndex(0);
      setSelected("");
      setResult(null);
      setRevealed(mode !== "RAPID_RECALL");
      setRating(null);
      setSeconds(20);
      setSessionSeconds(mode === "SPEED_CHALLENGE" ? count * 12 : 0);
      setResponseTimes([]);
      setSummary(null);
      setStarted(eventTime);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function answer(eventTime: number) {
    if (!session || !item || !selected) return;
    setBusy(true);
    try {
      const responseMs = Math.max(0, Math.round(eventTime - started));
      const data = await api<Result>(`learning-games/${session.id}/answer`, "POST", {
        question_id: item.question_id,
        answer: selected,
        rating,
        response_ms: responseMs,
      });
      setResponseTimes((times) => [...times, responseMs]);
      setResult(data);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function next(eventTime: number) {
    if (!session) return;
    if (index + 1 >= session.items.length) {
      setSummary({
        mode: session.mode,
        title: titleForMode(session.mode),
        questionCount: session.question_count,
        correctCount: result?.correct_count ?? 0,
        responseTimes,
      });
      setSession(null);
      return;
    }
    setIndex((i) => i + 1);
    setSelected("");
    setResult(null);
    setRating(null);
    setRevealed(session.mode !== "RAPID_RECALL");
    setSeconds(20);
    setStarted(eventTime);
  }
  if (summary) {
    const accuracy = Math.round((100 * summary.correctCount) / Math.max(1, summary.questionCount));
    const average = summary.responseTimes.length
      ? Math.round(summary.responseTimes.reduce((sum, value) => sum + value, 0) / summary.responseTimes.length / 100) / 10
      : null;
    return (
      <section className="game-stage card">
        <p className="eyebrow">Saved learning-game session</p>
        <h1>{summary.title} summary</h1>
        <div className="stats">
          <div><span className="muted">Completed</span><strong>{summary.questionCount}</strong></div>
          <div><span className="muted">Correct</span><strong>{summary.correctCount}</strong></div>
          <div><span className="muted">Accuracy</span><strong>{accuracy}%</strong></div>
          {average !== null && <div><span className="muted">Average response</span><strong>{average}s</strong></div>}
        </div>
        <p>{summary.questionCount - summary.correctCount} question(s) need another look. Use Mistake Center for targeted correction; official MEC scores are unchanged.</p>
        <p className="muted">Learning XP recorded: {Math.max(2, summary.correctCount)}.</p>
        <div className="toolbar">
          <button className="button" onClick={(event) => void start(summary.mode, summary.questionCount, event.timeStamp)}>Retry {summary.title}</button>
          <button className="button secondary" onClick={() => setSummary(null)}>Return to games</button>
        </div>
      </section>
    );
  }
  if (session && item)
    return (
      <section className="game-stage card">
        <div className="top">
          <div>
            <p className="eyebrow">Interactive learning session</p>
            <h1>
              {titleForMode(session.mode)}
            </h1>
            <p className="muted">
              Question {index + 1} of {session.question_count}
            </p>
          </div>
          {timed && (
            <div className={`timer ${seconds <= 5 ? "timer-warning" : ""}`} aria-live="polite">
              {seconds}s
            </div>
          )}
          {speedChallenge && (
            <div className={`timer ${sessionSeconds <= 10 ? "timer-warning" : ""}`} aria-live="polite">
              {sessionSeconds}s session
            </div>
          )}
        </div>
        <div className="game-progress">
          <i style={{ width: `${(100 * (index + (result ? 1 : 0))) / session.question_count}%` }} />
        </div>
        <h2>{item.snapshot.question_text}</h2>
        <QuestionMedia questionId={item.question_id} />
        {recall && !revealed ? (
          <section className="recall-prompt">
            <p>Pause and recall the answer before revealing the options.</p>
            <button className="button" onClick={() => setRevealed(true)}>
              Reveal answer choices
            </button>
          </section>
        ) : memoryMatch ? (
          <section className="recall-prompt" aria-label="Memory matching board">
            <p>Match this question to the answer card you recall. The answer key stays hidden until you check.</p>
            <div className="options" role="group" aria-label="Answer cards">
              {(["A", "B", "C", "D"] as const).map((key) => (
                <button type="button" className={`option ${selected === key ? "selected" : ""}`} key={key} onClick={() => setSelected(key)} disabled={!!result}>
                  <strong>{key}</strong> {item.snapshot[`option_${key.toLowerCase()}` as "option_a"]}
                </button>
              ))}
            </div>
            {selected && <p className="match-slot">Matched answer card: <strong>{selected}</strong></p>}
          </section>
        ) : (
          <fieldset className="options" disabled={!!result}>
            {(["A", "B", "C", "D"] as const).map((key) => (
              <label className={`option ${selected === key ? "selected" : ""}`} key={key}>
                <input
                  type="radio"
                  name="game-answer"
                  value={key}
                  checked={selected === key}
                  onChange={() => setSelected(key)}
                />
                <strong>{key}</strong> {item.snapshot[`option_${key.toLowerCase()}` as "option_a"]}
              </label>
            ))}
          </fieldset>
        )}
        {recall && revealed && !result && (
          <div className="confidence-picker" aria-label="Recall confidence">
            <p>How well did you know it?</p>
            {(
              [
                ["KNEW_IT", "Knew it"],
                ["ALMOST", "Almost"],
                ["DIDNT_KNOW", "Didn't know"],
              ] as const
            ).map(([value, label]) => (
              <button
                type="button"
                className={`button ${rating === value ? "" : "secondary"}`}
                key={value}
                onClick={() => setRating(value)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {!result && revealed && (
          <button
            className="button section"
            disabled={!selected || busy || (recall && !rating)}
            onClick={(event) => void answer(event.timeStamp)}
          >
            {busy ? "Checking…" : "Check answer"}
          </button>
        )}
        {result && (
          <section
            className={
              result.correct ? "game-feedback correct-feedback" : "game-feedback wrong-feedback"
            }
          >
            <span className="pill">
              {result.correct ? "Concept retrieved" : "Learning opportunity"}
            </span>
            <h2>{result.correct ? "Correct — keep the reasoning" : "Not yet — repair it now"}</h2>
            <p>
              <strong>Correct answer: {result.correct_answer}.</strong> {result.explanation}
            </p>
            <p>
              {timed && result.correct
                ? `Accuracy combo: ${combo}. Correctness still matters more than speed.`
                : "This learning-game result does not change an official MEC test score. It only updates your learning progress."}
            </p>
            <button className="button" onClick={(event) => next(event.timeStamp)}>
              {result.completed ? "View session summary" : "Next question"}
            </button>
          </section>
        )}
      </section>
    );
  return (
    <>
      <section className="student-page-header">
        <div>
          <p className="eyebrow">Interactive retrieval practice · {tier}</p>
          <h1>Learning games</h1>
          <p>
            Choose the interaction that matches what you need today. Every completed activity feeds
            the existing learning record, while official MEC test scores remain separate.
          </p>
        </div>
        <Link href="/recommendations" className="button secondary">
          Use my study plan
        </Link>
      </section>
      <div className="game-grid">
        {modes.map((m, i) => {
          const locked = !!m.premium && tier !== "PREMIUM";
          return (
            <article className="card game-card" key={`${m.title}-${i}`}>
              <div className="game-card-top">
                <span className="game-number">{String(i + 1).padStart(2, "0")}</span>
                <span className={`pill ${m.premium ? "premium-pill" : ""}`}>
                  {m.premium ? "Premium" : "Included"}
                </span>
              </div>
              <p className="eyebrow">{m.skill}</p>
              <h2>{m.title}</h2>
              <p>{m.purpose}</p>
              {locked ? (
                <button className="button" disabled>
                  Premium required
                </button>
              ) : m.href ? (
                <Link className="button" href={m.href as Route}>
                  Start {m.title}
                </Link>
              ) : (
                <button
                  className="button"
                  disabled={busy}
                  onClick={(event) => void start(m.mode!, m.count!, event.timeStamp)}
                >
                  Start {m.title}
                </button>
              )}
            </article>
          );
        })}
      </div>
      <p
        role="status"
        className={message.includes("complete") ? "success" : message ? "error" : ""}
      >
        {message}
      </p>
      <section className="card section">
        <div className="top">
          <div>
            <p className="eyebrow">Saved practice history</p>
            <h2>Recent game sessions</h2>
          </div>
          <strong>{history.length} recorded</strong>
        </div>
        {history.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Mode</th>
                  <th>Result</th>
                  <th>Accuracy</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td>{h.mode.replaceAll("_", " ")}</td>
                    <td>
                      {h.correct_count} / {h.question_count}
                    </td>
                    <td>{Math.round((100 * h.correct_count) / Math.max(1, h.question_count))}%</td>
                    <td>
                      <span className="pill">{h.status}</span>
                    </td>
                    <td>{new Date(h.started_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <h3>Your first game is ready</h3>
            <p>Complete a mode to begin your retrieval-practice history.</p>
          </div>
        )}
      </section>
    </>
  );
}
