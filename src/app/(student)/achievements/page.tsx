import { requirePage } from "@/lib/server/auth";
import { check } from "@/lib/server/data";
export default async function Page() {
  const { db, profile } = await requirePage();
  const [definitions, earned, attempts, answers] = await Promise.all([
    db.from("achievement_definitions").select("*"),
    db.from("user_achievements").select("*").eq("user_id", profile.id),
    db
      .from("attempts")
      .select("id,correct_count,answered_count,status")
      .eq("user_id", profile.id)
      .eq("status", "COMPLETED"),
    db
      .from("attempt_questions")
      .select("id", { count: "exact", head: true })
      .not("selected_answer", "is", null),
  ]);
  const unlocked = check(earned),
    completed = check(attempts);
  check(answers);
  const progress: Record<string, { value: number; target: number }> = {
    FIRST_TEST: { value: completed.length, target: 1 },
    HUNDRED_ANSWERS: { value: answers.count ?? 0, target: 100 },
    TEN_TESTS: { value: completed.length, target: 10 },
    PERFECT_TEST: {
      value: completed.some((a) => a.answered_count >= 10 && a.correct_count === a.answered_count)
        ? 1
        : 0,
      target: 1,
    },
  };
  return (
    <>
      <p className="eyebrow">Milestones earned through real learning</p>
      <h1>Achievements</h1>
      <p>Progress comes from completed questions and tests—not from opening pages.</p>
      <div className="stats achievement-grid">
        {check(definitions).map((d) => {
          const e = unlocked.find((v) => v.code === d.code),
            p = progress[d.code] ?? { value: e ? 1 : 0, target: 1 },
            percentage = Math.min(100, (100 * p.value) / p.target);
          return (
            <article
              key={d.code}
              className={`card achievement-card ${e ? "achievement-earned" : ""}`}
            >
              <div className="top">
                <p className="badge">{e ? "Unlocked" : "In progress"}</p>
                <strong>
                  {Math.min(p.value, p.target)} / {p.target}
                </strong>
              </div>
              <h2>{d.name}</h2>
              <p>{d.description}</p>
              <div className="mini-progress" aria-label={`${percentage}% complete`}>
                <i style={{ width: `${percentage}%` }} />
              </div>
              {e ? (
                <time>Earned {new Date(e.unlocked_at).toLocaleDateString()}</time>
              ) : (
                <small>{p.target - p.value} remaining</small>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}
