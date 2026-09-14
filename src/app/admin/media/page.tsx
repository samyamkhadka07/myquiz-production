import { requirePage } from "@/lib/server/auth";
import { check } from "@/lib/server/data";
import { AdminContributions } from "@/components/admin-contributions";
import { ContributionUpload } from "@/components/contribution-upload";

export default async function Page() {
  const { db } = await requirePage(true);
  const rows = check(
    await db
      .from("contributions")
      .select("*")
      .in("mime_type", ["image/png", "image/jpeg"])
      .order("created_at", { ascending: false })
      .limit(100),
  );
  return (
    <>
      <p className="eyebrow">Academic content · preserved source media</p>
      <h1>Media Library</h1>
      <p>
        Upload and review diagrams, graphs, chemical structures and scanned question snippets.
        Originals remain private and are linked to questions through their contribution provenance.
      </p>
      <section className="admin-grid">
        <div>
          <h2>Add media</h2>
          <ContributionUpload
            initial={[]}
            compact
            defaultCategory="QUESTIONS"
            accept=".png,.jpg,.jpeg,image/png,image/jpeg"
          />
        </div>
        <article className="card">
          <h2>Safe media workflow</h2>
          <ol>
            <li>Upload the original figure.</li>
            <li>Allow OCR to preserve its contribution and page identity.</li>
            <li>Open the extracted staged question.</li>
            <li>Keep the contribution ID in question provenance before verification.</li>
          </ol>
          <p className="muted">
            Students never receive private Storage paths. Published question media must be delivered
            through an authorized application response.
          </p>
        </article>
      </section>
      <h2 className="section">Image resources</h2>
      <AdminContributions initial={rows} />
    </>
  );
}
