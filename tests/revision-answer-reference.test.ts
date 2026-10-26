import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("post-test answer-key reference", () => {
  it("shows a correct-answer explanation without invented wrong-option reasoning", () => {
    const source = readFileSync("src/components/review.tsx", "utf8");
    expect(source).toContain("Answer key reference");
    expect(source).not.toContain("A separate verified option explanation is not available yet.");
    expect(source).toContain("q.explanation");
  });

  it("does not expose post-test answer review to active attempts", () => {
    const result = readFileSync("src/app/(student)/results/[id]/page.tsx", "utf8");
    expect(result).toContain("d.attempt.status==='ACTIVE'");
    expect(result).toContain("redirect(`/quiz/${id}`)");
  });

  it("guards staff-only revision review and never exposes the answer draft table to anon access", () => {
    const page = readFileSync("src/app/admin/revision-prompts/page.tsx", "utf8");
    const migration = readFileSync("supabase/migrations/0032_revision_reference_staging.sql", "utf8");
    expect(page).toContain("requirePage(true)");
    expect(page).toContain("staff(profile)");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.revision_question_drafts from public,anon,authenticated");
  });
});
