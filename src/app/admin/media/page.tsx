import { requirePage } from "@/lib/server/auth";
import { check } from "@/lib/server/data";
import { MediaLibrary } from "@/components/media-library";

export default async function Page() {
  const { db } = await requirePage(true);
  const rows = check(
    await db
      .from("media_assets")
      .select("*,question_media_links(question_id)")
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
      <p>
        Upload reusable academic figures directly to private Storage, then link them to one or more
        canonical questions. Linking resets publication so content and accessibility are reviewed
        together.
      </p>
      <MediaLibrary initial={rows} />
    </>
  );
}
