"use client";
import { useRef, useState } from "react";
import { Upload } from "tus-js-client";
import { api } from "@/lib/client-api";
import { createClient } from "@/lib/supabase/client";
type Contribution = {
  id: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  category: string;
  object_path: string;
  processing_state: string;
  review_state: string;
  created_at: string;
  error_detail?: string | null;
};
const accepted = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/csv",
  "image/png",
  "image/jpeg",
];
export function ContributionUpload({
  initial,
  compact = false,
  defaultCategory = "QUESTIONS",
  accept = ".pdf,.docx,.txt,.csv,.png,.jpg,.jpeg",
}: {
  initial: Contribution[];
  compact?: boolean;
  defaultCategory?: string;
  accept?: string;
}) {
  const [rows, setRows] = useState(initial),
    [progress, setProgress] = useState<number | null>(null),
    [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const upload = useRef<Upload | null>(null);
  async function refresh() {
    setRows(await api<Contribution[]>("contributions"));
  }
  async function submit(form: HTMLFormElement) {
    const file = new FormData(form).get("file") as File;
    const category = String(new FormData(form).get("category"));
    if (!file || !accepted.includes(file.type)) {
      setMessage("Choose a supported PDF, DOCX, TXT, CSV, PNG or JPEG file.");
      return;
    }
    setBusy(true);
    setMessage("Preparing secure upload…");
    const request_key = crypto.randomUUID();
    try {
      const contribution = await api<Contribution>("contributions", "POST", {
        filename: file.name,
        mime: file.type,
        size: file.size,
        category,
        request_key,
      });
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Your session expired.");
      await new Promise<void>((resolve, reject) => {
        upload.current = new Upload(file, {
          endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
          retryDelays: [0, 1000, 3000, 5000, 10000],
          headers: {
            authorization: `Bearer ${session.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          metadata: {
            bucketName: "contributions",
            objectName: contribution.object_path,
            contentType: file.type,
            cacheControl: "3600",
          },
          removeFingerprintOnSuccess: true,
          chunkSize: 6 * 1024 * 1024,
          onError: reject,
          onProgress: (sent, total) => setProgress(Math.round((sent / total) * 100)),
          onSuccess: () => resolve(),
        });
        upload.current.start();
      });
      await api(`contributions/${contribution.id}/finalize`, "POST", { size: file.size });
      setMessage("Original saved. Processing has started.");
      setProgress(null);
      form.reset();
      await refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <form
        className="card form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(e.currentTarget);
        }}
      >
        {compact ? (
          <input type="hidden" name="category" value={defaultCategory} />
        ) : (
          <label>
            Material category
            <select name="category" defaultValue={defaultCategory}>
              {[
                ["QUESTIONS", "Question set"],
                ["ANSWER_KEYS", "Answer key"],
                ["SOLUTIONS", "Solutions"],
                ["NOTES", "Notes"],
                ["ESSAYS", "Essay"],
                ["READING", "Reading material"],
                ["PAST_PAPER", "Past paper"],
                ["MOCK_TEST", "Mock test"],
              ].map(([v, n]) => (
                <option key={v} value={v}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          {compact ? "Canonical CSV file" : "Original file"}
          <input name="file" type="file" accept={accept} required />
        </label>
        <p className="muted">
          The original uploads directly to private storage. Processing validates every row before
          anything enters the canonical bank.
        </p>
        <div className="toolbar">
          <button className="button" disabled={busy}>
            {compact ? "Validate and stage CSV" : "Upload contribution"}
          </button>
          {busy && (
            <button
              type="button"
              className="button secondary"
              onClick={() => upload.current?.abort()}
            >
              Pause
            </button>
          )}
        </div>
        {progress !== null && (
          <progress value={progress} max="100">
            {progress}%
          </progress>
        )}
        <p role="status" className={message.includes("saved") ? "success" : message ? "error" : ""}>
          {message}
        </p>
      </form>
      {!compact && (
        <>
          <h2 className="section">Contribution history</h2>
          <div className="table-wrap card">
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Category</th>
                  <th>Size</th>
                  <th>Processing</th>
                  <th>Review</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.original_filename}
                      {r.error_detail && <small className="error">{r.error_detail}</small>}
                    </td>
                    <td>{r.category}</td>
                    <td>{(r.byte_size / 1048576).toFixed(1)} MB</td>
                    <td>{r.processing_state}</td>
                    <td>{r.review_state}</td>
                    <td>{new Date(r.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <p>No contributions yet.</p>}
          </div>
        </>
      )}
    </>
  );
}
