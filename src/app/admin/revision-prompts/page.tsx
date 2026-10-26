import Link from "next/link";
import type { Route } from "next";
import { requirePage, staff } from "@/lib/server/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const SUBJECTS = ["ALL", "BOTANY", "ZOOLOGY", "CHEMISTRY", "PHYSICS", "MAT"] as const;
const PAGE_SIZE = 40;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; subject?: string }>;
}) {
  const { profile } = await requirePage(true);
  staff(profile);
  const params = await searchParams;
  const subject = SUBJECTS.find((s) => s === params.subject) ?? "ALL";
  const parsedPage = Number(params.page ?? "1");
  const page = Number.isSafeInteger(parsedPage) ? Math.min(Math.max(parsedPage, 1), 5000) : 1;
  const from = (page - 1) * PAGE_SIZE;
  const db = createAdminClient();
  let query = db
    .from("revision_question_drafts")
    .select("source_id,subject_code,source_document,source_page,source_prompt,answer_draft,answer_reason,external_reference,academic_review_status,publication_rights_status", { count: "exact" })
    .order("subject_code")
    .order("source_id")
    .range(from, from + PAGE_SIZE - 1);
  if (subject !== "ALL") query = query.eq("subject_code", subject);
  const { data, error, count } = await query;
  if (error) throw new Error("Revision answer review is temporarily unavailable.");
  const records = data ?? [];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const href = (nextPage: number, nextSubject = subject) =>
    `/admin/revision-prompts?page=${nextPage}&subject=${nextSubject}` as Route;

  return (
    <>
      <p className="eyebrow">Staff-only · source evidence</p>
      <h1>Revision question and answer drafts</h1>
      <p>
        These are <strong>unverified answer-reference drafts</strong> extracted from user-provided
        revision sources, not approved MCQs. Verify academic accuracy, add four distinct options,
        check duplicate content and confirm publication rights before the normal question
        verification and publication workflow. They are not visible to students.
      </p>
      <section className="card section">
        <p><strong>{count ?? 0} drafts</strong> in this view · Page {page} of {totalPages}</p>
        <div className="toolbar">
          {SUBJECTS.map((code) => (
            <Link key={code} className={subject === code ? "button" : "button secondary"} href={href(1, code)}>
              {code === "ALL" ? "All subjects" : code}
            </Link>
          ))}
        </div>
      </section>
      {records.map((r) => (
        <article key={r.source_id} className="card section">
          <p className="eyebrow">{r.subject_code} · {r.academic_review_status} · Rights: {r.publication_rights_status}</p>
          <h2>{r.source_prompt}</h2>
          <p><strong>Answer draft:</strong> {r.answer_draft ?? "Unresolved — do not guess"}</p>
          {r.answer_reason && <p><strong>Correct-answer reasoning draft:</strong> {r.answer_reason}</p>}
          <p className="muted">Source: {r.source_document} · PDF page {r.source_page} · {r.source_id}</p>
          {r.external_reference && (
            <p className="muted">Verification reference: <a href={r.external_reference} rel="noopener noreferrer" target="_blank">Open source</a></p>
          )}
        </article>
      ))}
      {records.length === 0 && <p className="card section">No drafts match this subject.</p>}
      <nav className="toolbar" aria-label="Revision review pagination">
        {page > 1 && <Link className="button secondary" href={href(page - 1)}>Previous</Link>}
        {page < totalPages && <Link className="button secondary" href={href(page + 1)}>Next</Link>}
      </nav>
    </>
  );
}
