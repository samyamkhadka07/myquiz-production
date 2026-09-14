import { requirePage } from "@/lib/server/auth";
import { check } from "@/lib/server/data";
import { QuestionReviewQueue } from "@/components/question-review-queue";
export default async function Page() {
  const { db } = await requirePage(true);
  const rows = check(
    await db
      .from("questions")
      .select("*")
      .eq("lifecycle", "VERIFIED")
      .eq("verification_status", "VERIFIED")
      .eq("publication_status", "DRAFT")
      .order("verified_at", { ascending: true })
      .limit(100),
  );
  return (
    <>
      <p className="eyebrow">Academic content · release control</p>
      <h1>Question publication queue</h1>
      <p>
        Release verified questions into student tests without mixing publication decisions into
        academic verification.
      </p>
      <QuestionReviewQueue initial={rows} mode="publication" />
    </>
  );
}
