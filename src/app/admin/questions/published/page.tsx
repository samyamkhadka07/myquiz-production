import { requirePage } from "@/lib/server/auth";
import { check } from "@/lib/server/data";
import { QuestionReviewQueue } from "@/components/question-review-queue";

export default async function Page() {
  const { db } = await requirePage(true);
  const rows = check(
    await db.from("questions").select("*").eq("lifecycle", "PUBLISHED")
      .eq("publication_status", "PUBLISHED").order("published_at", { ascending: false }).limit(100),
  );
  return (
    <>
      <p className="eyebrow">Academic content · live question bank</p>
      <h1>Published questions</h1>
      <p>These questions are currently student-visible. Select individual questions or all visible questions to archive them in one action.</p>
      <QuestionReviewQueue initial={rows} mode="published" />
    </>
  );
}
