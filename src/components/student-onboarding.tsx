"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client-api";
import type { Taxonomy } from "@/lib/contracts";

export function StudentOnboarding({ taxonomy }: { taxonomy: Taxonomy }) {
  const router = useRouter();
  const [program, setProgram] = useState("");
  const [target, setTarget] = useState(140);
  const [weak, setWeak] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const group = taxonomy.programs.find((item) => item.id === program)?.exam_group_id;
  const blueprint = taxonomy.blueprints.find((item) => item.exam_group_id === group);
  const subjectIds = useMemo(
    () =>
      new Set(
        taxonomy.allocations
          .filter((item) => item.blueprint_id === blueprint?.id)
          .map((item) => item.subject_id),
      ),
    [blueprint, taxonomy.allocations],
  );
  const subjects = taxonomy.subjects.filter((item) => subjectIds.has(item.id));
  function toggle(id: string) {
    setWeak((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : current.length < 4
          ? [...current, id]
          : current,
    );
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await api("onboarding", "POST", {
        program_id: program,
        target_score: target,
        weak_subject_ids: weak,
      });
      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="onboarding-flow" onSubmit={submit}>
      <section className="card onboarding-step">
        <span className="step-number">01</span>
        <div>
          <p className="eyebrow">Your exam</p>
          <h2>Which MEC program are you preparing for?</h2>
          <p>
            MyQuiz uses the published blueprint for this program when building tests and
            recommendations.
          </p>
          <label>
            Exam program
            <select
              required
              value={program}
              onChange={(event) => {
                setProgram(event.target.value);
                setWeak([]);
              }}
            >
              <option value="">Choose your program</option>
              {taxonomy.programs.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      <section className="card onboarding-step">
        <span className="step-number">02</span>
        <div>
          <p className="eyebrow">Your goal</p>
          <h2>Set a score worth working toward</h2>
          <p>This is a planning target, not a prediction or guarantee. It can be changed later.</p>
          <label>
            Target score out of 200
            <input
              type="range"
              min="1"
              max="200"
              step="1"
              value={target}
              onChange={(event) => setTarget(Number(event.target.value))}
            />
            <strong className="target-value">{target} / 200</strong>
          </label>
        </div>
      </section>
      <section className="card onboarding-step">
        <span className="step-number">03</span>
        <div>
          <p className="eyebrow">Starting focus</p>
          <h2>Which subjects currently feel hardest?</h2>
          <p>Select up to four. Your real results will gradually replace this self-assessment.</p>
          {program ? (
            <div className="subject-choice-grid">
              {subjects.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={weak.includes(item.id) ? "choice-chip selected" : "choice-chip"}
                  aria-pressed={weak.includes(item.id)}
                  onClick={() => toggle(item.id)}
                >
                  {item.name}
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">Choose your program first to see its subjects.</p>
          )}
        </div>
      </section>
      <div className="onboarding-finish">
        <p role="status" className={message ? "error" : ""}>
          {message}
        </p>
        <button className="button" disabled={busy || !program}>
          {busy ? "Building your plan…" : "Build my first study plan"}
        </button>
        <small>Your plan will improve after each completed practice session.</small>
      </div>
    </form>
  );
}
