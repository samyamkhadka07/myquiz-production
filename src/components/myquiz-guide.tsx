"use client";

import Link from "next/link";

const links = [
  ["Tests & practice", "/tests", "Choose focused, subject or timed preparation."],
  ["Mistake Center", "/mistakes", "Repair questions you previously missed."],
  ["Flashcards", "/flashcards", "Review due cards using spaced repetition."],
  ["Study plan", "/recommendations", "Follow your current priorities and target score."],
  ["Leaderboard", "/leaderboard", "Share aggregate progress only when you opt in."],
  ["Achievements", "/achievements", "Track learning milestones."],
  ["Learning games", "/games", "Practice retrieval and correction without affecting test scores."],
  ["Contributions", "/contributions", "Send source material for staff review; it never publishes automatically."],
  ["Subscription", "/subscription", "Review access and submit a manual payment request."],
] as const;

export function MyQuizGuide() {
  return (
    <details className="myquiz-guide">
      <summary aria-label="Open MyQuiz Guide">?</summary>
      <section aria-label="MyQuiz Guide panel">
        <p className="eyebrow">MyQuiz Guide</p>
        <h2>What would you like to do?</h2>
        <nav>
          {links.map(([label, href, detail]) => (
            <Link href={href} key={href}>
              <strong>{label}</strong>
              <span>{detail}</span>
            </Link>
          ))}
        </nav>
      </section>
    </details>
  );
}
