import { requirePage } from "@/lib/server/auth";
import { check } from "@/lib/server/data";
import { QuestionReviewQueue } from "@/components/question-review-queue";
export default async function Page() {
  const { db } = await requirePage(true);
  const rows = check(
    await db
      .from("questions")
      .select("*")
      .in("lifecycle", ["PENDING_REVIEW", "VALIDATION_REQUIRED"])
      .order("created_at", { ascending: true })
      .limit(100),
  );
  return (
    <>
      <p className="eyebrow">Academic content · deliberate review</p>
      <h1>Question verification queue</h1>
      <p>
        Inspect the answer, solution, every distractor explanation and source evidence. Verification
        is disabled while academic warnings remain.
      </p>
      <QuestionReviewQueue initial={rows} mode="verification" />
    </>
  );
}
