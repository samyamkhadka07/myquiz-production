"use client";
import { useRef, useState } from "react";
import Image from "next/image";
import { Upload } from "tus-js-client";
import { api } from "@/lib/client-api";
import { createClient } from "@/lib/supabase/client";
type Asset = {
  id: string;
  object_path: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  default_alt_text: string;
  status: string;
  created_at: string;
  preview_url?: string | null;
  preview_expires_in?: number | null;
  question_media_links?: { question_id: string }[];
};
const accepted = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
export function MediaLibrary({ initial }: { initial: Asset[] }) {
  const [rows, setRows] = useState(initial),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState<number | null>(null),
    [message, setMessage] = useState(""),
    [query, setQuery] = useState(""),
    [selectedFile, setSelectedFile] = useState<File | null>(null);
  const current = useRef<Upload | null>(null);
  async function refresh() {
    setRows(await api<Asset[]>("media"));
  }
  async function submit(form: HTMLFormElement) {
    const data = new FormData(form),
      file = data.get("file") as File,
      alt = String(data.get("alt_text") ?? "").trim();
    if (!file || !accepted.includes(file.type)) {
      setMessage("Choose a PNG, JPEG, WebP or SVG image.");
      return;
    }
    setBusy(true);
    setMessage("Preparing private upload…");
    try {
      const asset = await api<Asset>("media", "POST", {
        filename: file.name,
        mime: file.type,
        size: file.size,
        alt_text: alt,
        request_key: crypto.randomUUID(),
      });
      const supabase = createClient(),
        {
          data: { session },
        } = await supabase.auth.getSession();
      if (!session) throw new Error("Your session expired.");
      await new Promise<void>((resolve, reject) => {
        current.current = new Upload(file, {
          endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
          retryDelays: [0, 1000, 3000, 5000],
          headers: {
            authorization: `Bearer ${session.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          metadata: {
            bucketName: "question-media",
            objectName: asset.object_path,
            contentType: file.type,
            cacheControl: "3600",
          },
          chunkSize: 6 * 1024 * 1024,
          removeFingerprintOnSuccess: true,
          onProgress: (sent, total) => setProgress(Math.round((sent / total) * 100)),
          onError: reject,
          onSuccess: () => resolve(),
        });
        current.current.start();
      });
      await api(`media/${asset.id}/finalize`, "POST", {});
      form.reset();
      setSelectedFile(null);
      setProgress(null);
      setMessage("Media saved privately and is ready to link to questions.");
      await refresh();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function link(form: HTMLFormElement, asset: Asset) {
    const data = new FormData(form);
    setBusy(true);
    try {
      await api(`media/${asset.id}/link`, "POST", {
        question_id: String(data.get("question_id")),
        position: Number(data.get("position")),
        alt_text: String(data.get("alt_text")),
        caption: String(data.get("caption") || "") || null,
      });
      setMessage("Media linked. The question returned to staging for deliberate review.");
      form.reset();
      await refresh();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(asset: Asset) {
    if (asset.question_media_links?.length) {
      setMessage("Remove this media from its linked questions before deleting it.");
      return;
    }
    if (!window.confirm(`Permanently delete ${asset.original_filename}? This cannot be undone.`))
      return;
    setBusy(true);
    try {
      await api(`media/${asset.id}`, "DELETE");
      setMessage("Unused media deleted from private storage.");
      await refresh();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const visible = rows.filter((asset) =>
    `${asset.original_filename} ${asset.default_alt_text}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <>
      <form
        className="card form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(e.currentTarget);
        }}
      >
        <label>
          Image file
          <input
            name="file"
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
            required
            onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
          />
        </label>
        {selectedFile ? <p className="muted">Selected: {selectedFile.name} · {selectedFile.type} · {(selectedFile.size / 1024).toFixed(1)} KB</p> : null}
        <label>
          Accessible description
          <input
            name="alt_text"
            minLength={3}
            maxLength={500}
            required
            placeholder="Describe the academic information shown"
          />
        </label>
        <p className="muted">
          The file uploads directly to private Supabase Storage; it does not pass through the
          application server.
        </p>
        <div className="toolbar">
          <button className="button" disabled={busy}>
            Upload media
          </button>
          {busy && (
            <button
              type="button"
              className="button secondary"
              onClick={() => void current.current?.abort()}
            >
              Pause upload
            </button>
          )}
        </div>
        {progress !== null && (
          <progress value={progress} max="100">
            {progress}%
          </progress>
        )}
      </form>
      <p
        role="status"
        className={
          message.includes("saved") || message.includes("linked")
            ? "success"
            : message
              ? "error"
              : ""
        }
      >
        {message}
      </p>
      <label className="media-search">
        Search media
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filename or academic description"
        />
      </label>
      <div className="media-library-grid">
        {visible.map((asset) => (
          <article className="card media-record" key={asset.id}>
            {asset.preview_url ? (
              <Image
                className="media-preview"
                src={asset.preview_url}
                alt={asset.default_alt_text}
                width={560}
                height={360}
                unoptimized
                onError={() =>
                  setRows((items) =>
                    items.map((item) =>
                      item.id === asset.id ? { ...item, preview_url: null } : item,
                    ),
                  )
                }
              />
            ) : asset.mime_type.startsWith("image/") ? (
              <div className="media-preview media-preview-unavailable" role="status">
                Preview unavailable. Refresh to request a new secure preview link.
              </div>
            ) : null}
            <div className="top">
              <div>
                <h2>{asset.original_filename}</h2>
                <p className="muted">
                  {asset.mime_type} · {(asset.byte_size / 1048576).toFixed(2)} MB
                </p>
              </div>
              <span className="pill">{asset.status}</span>
            </div>
            <p>{asset.default_alt_text}</p>
            <p className="muted">Linked to {asset.question_media_links?.length ?? 0} question(s)</p>
            {asset.mime_type.startsWith("image/") ? (
              <button className="button secondary" disabled={busy} onClick={() => void refresh()}>
                Refresh preview
              </button>
            ) : null}
            <button
              className="button secondary"
              disabled={busy || Boolean(asset.question_media_links?.length)}
              onClick={() => void remove(asset)}
            >
              Delete unused media
            </button>
            <details>
              <summary>Link to a canonical question</summary>
              <form
                className="form section"
                onSubmit={(e) => {
                  e.preventDefault();
                  void link(e.currentTarget, asset);
                }}
              >
                <label>
                  Question ID
                  <input name="question_id" required pattern="[0-9a-fA-F-]{36}" />
                </label>
                <label>
                  Position
                  <input name="position" type="number" min="0" max="20" defaultValue="0" required />
                </label>
                <label>
                  Alt text
                  <input
                    name="alt_text"
                    defaultValue={asset.default_alt_text}
                    minLength={3}
                    maxLength={500}
                    required
                  />
                </label>
                <label>
                  Caption
                  <input name="caption" maxLength={1000} />
                </label>
                <button className="button" disabled={busy}>
                  Link and return question to staging
                </button>
              </form>
            </details>
          </article>
        ))}
      </div>
      {!visible.length && (
        <section className="card empty-state">
          <h2>{rows.length ? "No media matches this search" : "No reusable media yet"}</h2>
          <p>
            {rows.length
              ? "Try a different filename or description."
              : "Upload the first diagram, graph, table or scanned snippet."}
          </p>
        </section>
      )}
    </>
  );
}
