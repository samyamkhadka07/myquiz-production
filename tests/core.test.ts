import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs";
import fc from "fast-check";
import { scoreResponses } from "@/lib/quiz/scoring";
import { priorityScore } from "@/lib/recommendations/deterministic";
import { isStaffRole, roleHome } from "@/lib/auth/role-routing";
import academic from "../data/mec-2026.json";
describe("production scoring", () => {
  it("scores mixed answers with blueprint policy", () =>
    expect(
      scoreResponses(
        [
          { selected: "A", correct: "A" },
          { selected: "B", correct: "A" },
          { selected: null, correct: "A" },
        ],
        { correct: 1, incorrect: -0.25, unanswered: 0 },
      ),
    ).toEqual({ correct: 1, incorrect: 1, unanswered: 1, score: 0.75, maximum: 3 }));
  it("applies negative marks to 200 wrong answers", () =>
    expect(
      scoreResponses(Array.from({ length: 200 }, () => ({ selected: "B", correct: "A" }))),
    ).toMatchObject({ score: -50 }));
  it("uses supplied policy", () =>
    expect(
      scoreResponses([{ selected: "A", correct: "A" }], {
        correct: 2,
        incorrect: -1,
        unanswered: 0,
      }).score,
    ).toBe(2));
  it("preserves count and scoring bounds for arbitrary answer sets", () =>
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            selected: fc.constantFrom("A" as const, "B" as const, "C" as const, "D" as const, null),
            correct: fc.constantFrom("A" as const, "B" as const, "C" as const, "D" as const),
          }),
          { maxLength: 200 },
        ),
        (responses) => {
          const r = scoreResponses(responses);
          expect(r.correct + r.incorrect + r.unanswered).toBe(responses.length);
          expect(r.score).toBeGreaterThanOrEqual(-0.25 * responses.length);
          expect(r.score).toBeLessThanOrEqual(responses.length);
        },
      ),
      { numRuns: 300 },
    ));
});
describe("academic source", () => {
  it("preserves original PDF checksum", () =>
    expect(
      createHash("sha256").update(fs.readFileSync(academic.source_document)).digest("hex"),
    ).toBe(academic.sha256));
  for (const group of academic.groups)
    it(`Group ${group.code} totals 200 with consistent taxonomy`, () => {
      expect(group.allocations.reduce((n, a) => n + a.question_count, 0)).toBe(
        group.question_count,
      );
      expect(Object.values(group.cognitive_distribution).reduce((a, b) => a + b, 0)).toBe(100);
      for (const a of group.allocations)
        expect(academic.units.some((u) => u.code === a.unit_code && u.subject === a.subject)).toBe(
          true,
        );
      expect(group.duration_seconds).toBe(10800);
      expect(group.qualification_rule).toEqual({ type: "PERCENTILE", threshold: 50 });
    });
  it("keeps undefined PCL detail unseeded", () =>
    expect(academic.units.filter((u) => u.subject === "PCL").flatMap((u) => u.topics)).toEqual([]));
  it("retains exact source substrings for every detailed topic", () => {
    for (const u of academic.units)
      for (const t of u.topics) expect(u.source_text).toContain(t.source_text);
  });
});
describe("deterministic recommendations", () => {
  it("prioritizes weak, slow, overdue material", () => {
    const base = {
      topicId: "fixture",
      attempts: 20,
      avgResponseMs: 0,
      daysSincePractice: 0,
      overdueCards: 0,
    };
    expect(
      priorityScore({
        ...base,
        accuracy: 0.2,
        avgResponseMs: 90000,
        daysSincePractice: 20,
        overdueCards: 10,
      }),
    ).toBeGreaterThan(priorityScore({ ...base, accuracy: 0.95 }));
  });
  it("clamps inaccurate inputs and remains finite", () =>
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 300 }), (n) => {
        const score = priorityScore({
          topicId: "fixture",
          accuracy: n / 100,
          attempts: n,
          avgResponseMs: n * 1000,
          daysSincePractice: n,
          overdueCards: n,
        });
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }),
    ));
});
describe("admin access request UI contract", () => {
  it("offers Student and approval-gated Admin registration choices", () => {
    const source = fs.readFileSync("src/components/auth-form.tsx", "utf8");
    expect(source).toContain("Admin (approval required)");
    expect(source).toContain("Super Admin approves your request");
  });
  it("does not hard-code a personal Gmail identity into application source", () => {
    for (const file of [
      "src/app/auth/actions.ts",
      "src/lib/server/auth.ts",
      "supabase/migrations/0016_super_admin_approval.sql",
    ])
      expect(fs.readFileSync(file, "utf8")).not.toMatch(/@gmail\.com/i);
  });
  it("routes every authoritative staff role to the administration app", () => {
    expect(roleHome("ADMIN")).toBe("/admin");
    expect(roleHome("SUPER_ADMIN")).toBe("/admin");
    expect(roleHome("MODERATOR")).toBe("/admin");
    expect(isStaffRole("STUDENT")).toBe(false);
  });
  it("keeps pending and rejected requests non-privileged with explicit status", () => {
    expect(roleHome("STUDENT", "PENDING")).toBe("/dashboard?admin_request=pending");
    expect(roleHome("STUDENT", "REJECTED")).toBe("/dashboard?admin_request=rejected");
    expect(roleHome("STUDENT")).toBe("/dashboard");
  });
  it("uses distinct student and administration shells", () => {
    const student = fs.readFileSync("src/components/app-shell.tsx", "utf8");
    const administration = fs.readFileSync("src/components/admin-shell.tsx", "utf8");
    expect(student).toContain("Student navigation");
    expect(student).not.toContain("Administration</Link>");
    expect(administration).toContain("ADMINISTRATION");
    expect(administration).toContain("Admin Requests / Approvals");
    expect(administration).not.toContain("Tests & practice");
  });
  it("resolves post-login routing from database roles rather than submitted form roles", () => {
    const source = fs.readFileSync("src/app/auth/actions.ts", "utf8");
    expect(source).toContain('from("profiles").select("role,onboarding_completed_at")');
    expect(source).toContain("roleHome(");
    expect(source).not.toContain("form.get('role')");
  });
});
describe("functional separation and engagement contracts", () => {
  it("gives purpose-specific Admin navigation unique routes", () => {
    const source = fs.readFileSync("src/components/admin-shell.tsx", "utf8");
    for (const route of [
      "/admin/questions/verification",
      "/admin/questions/publication",
      "/admin/blueprints",
      "/admin/media",
      "/admin/reading-materials",
      "/admin/duplicates",
      "/admin/reports",
      "/admin/ingestion",
      "/admin/ai-usage",
    ])
      expect(source).toContain(route);
    expect(source).toMatch(
      /label:\s*["']Reading Materials["'],\s*href:\s*["']\/admin\/reading-materials["']/,
    );
    expect(source).toMatch(/label:\s*["']Reports["'],\s*href:\s*["']\/admin\/reports["']/);
    expect(source).toMatch(
      /label:\s*["']AI Review \/ Usage["'],\s*href:\s*["']\/admin\/ai-usage["']/,
    );
  });
  it("keeps Student preparation fields out of Admin Profile", () => {
    const page = fs.readFileSync("src/components/admin-profile-form.tsx", "utf8");
    expect(page).toContain("SUPER ADMIN · PROTECTED");
    expect(page).not.toContain("Target score");
    expect(page).not.toContain("Exam program");
  });
  it("offers persisted, distinct learning modes rather than decorative links", () => {
    const source = fs.readFileSync("src/components/interactive-games.tsx", "utf8");
    for (const mode of [
      "RAPID_FIRE",
      "RAPID_RECALL",
      "MISTAKE_RESCUE",
      "ACCURACY",
      "DAILY_CHALLENGE",
    ])
      expect(source).toContain(mode);
    expect(source).toContain("learning-games");
    expect(source).toContain("does not change an official MEC test score");
  });
  it("separates academic verification from publication", () => {
    const verification = fs.readFileSync("src/app/admin/questions/verification/page.tsx", "utf8");
    const publication = fs.readFileSync("src/app/admin/questions/publication/page.tsx", "utf8");
    expect(verification).toContain('mode="verification"');
    expect(publication).toContain('mode="publication"');
    expect(verification).not.toContain("QuestionEditor");
    expect(publication).not.toContain("QuestionEditor");
  });
  it("keeps canonical CSV intake inside Question Management", () => {
    const source = fs.readFileSync("src/app/admin/questions/page.tsx", "utf8");
    expect(source).toContain("Import questions from canonical CSV");
    expect(source).toContain("ContributionUpload");
    expect(source).toContain("Recent staged import results");
  });
  it("stores reusable question media privately and renders it across learning surfaces", () => {
    const migration = fs.readFileSync("supabase/migrations/0019_question_media.sql", "utf8");
    expect(migration).toContain("create table public.media_assets");
    expect(migration).toContain("create table public.question_media_links");
    expect(migration).toContain("values('question-media','question-media',false");
    expect(migration).toContain("perform require_staff()");
    expect(migration).toContain("publication_status='DRAFT'");
    const uploader = fs.readFileSync("src/components/media-library.tsx", "utf8");
    expect(uploader).toContain("/storage/v1/upload/resumable");
    expect(uploader).toContain('bucketName: "question-media"');
    for (const file of [
      "src/components/quiz.tsx",
      "src/components/review.tsx",
      "src/components/interactive-games.tsx",
      "src/app/(student)/bookmarks/page.tsx",
    ])
      expect(fs.readFileSync(file, "utf8")).toContain("QuestionMedia");
  });
  it("preserves auditable question versions and requires re-review after restore", () => {
    const migration = fs.readFileSync("supabase/migrations/0020_question_versions.sql", "utf8");
    expect(migration).toContain("create table public.question_versions");
    expect(migration).toContain("create trigger question_capture_version");
    expect(migration).toContain("create function public.restore_question_version");
    expect(migration).toContain("lifecycle='STAGED'");
    expect(migration).toContain("verification_status='UNVERIFIED'");
    expect(migration).toContain("QUESTION_VERSION_RESTORED");
  });
  it("routes incomplete student profiles through persisted onboarding", () => {
    expect(roleHome("STUDENT", null, false)).toBe("/onboarding");
    expect(roleHome("STUDENT", null, true)).toBe("/dashboard");
    expect(roleHome("SUPER_ADMIN", null, false)).toBe("/admin");
    const migration = fs.readFileSync("supabase/migrations/0021_student_onboarding.sql", "utf8");
    expect(migration).toContain("complete_student_onboarding");
    expect(migration).toContain("onboarding_completed_at=now()");
  });
  it("queries the production ingestion timestamp used by the Admin Dashboard", () => {
    const page = fs.readFileSync("src/app/admin/page.tsx", "utf8");
    expect(page).toContain("status,started_at,completed_at,error");
    expect(page).not.toContain("status,started_at,finished_at,error");
  });
});
