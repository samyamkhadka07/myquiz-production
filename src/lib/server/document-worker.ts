import "server-only";
import { createHash } from "node:crypto";
import { createSHA256 } from "hash-wasm";
import { createAdminClient } from "@/lib/supabase/admin";
import { check } from "./data";
import { transcribeImage } from "./ai";
import {
  detectQuestions,
  detectAnswerKeys,
  chunkText,
  inspectSignature,
} from "@/lib/documents/extract";
import { readRange, csvRecords, inspectDocxArchive } from "@/lib/documents/bounded";
import { parseCanonicalCsv } from "@/lib/documents/canonical-csv";
import type { Taxonomy } from "@/lib/contracts";
type Cursor = {
  step?: string;
  offset?: number;
  hash_state?: string;
  page?: number;
  pages?: number;
  carry?: string;
  buffer?: string;
  header?: string;
  row?: number;
  partial?: boolean;
  carry_page?: number;
};
type Job = {
  id: string;
  kind: string;
  contribution_id: string;
  lease_token: string;
  cursor: Cursor;
  step_attempts: number;
  max_attempts: number;
};
type Contribution = {
  id: string;
  uploader_id: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  bucket: string;
  object_path: string;
  category: string;
  finalized_at: string | null;
};
type Stage = {
  key: string;
  page: number;
  row: number | null;
  data: Record<string, unknown>;
  errors: string[];
  duplicate: string | null;
};
const terminal = new Set(["SUCCEEDED", "DEAD_LETTER", "NEEDS_REVIEW", "FAILED"]);
async function preserveExtractedMedia(
  db: ReturnType<typeof createAdminClient>,
  c: Contribution,
  page: number,
  bytes: Uint8Array,
  mime: string,
  width?: number,
  height?: number,
) {
  const existing = check(
    await db
      .from("media_assets")
      .select("id")
      .eq("source_contribution_id", c.id)
      .eq("source_page", page)
      .maybeSingle(),
  ) as { id: string } | null;
  if (existing) return existing.id;
  const extension = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const objectPath = `extracted/${c.id}/page-${page}.${extension}`;
  check(
    await db.storage
      .from("question-media")
      .upload(objectPath, bytes, { contentType: mime, upsert: true, cacheControl: "3600" }),
  );
  const inserted = check(
    await db
      .from("media_assets")
      .insert({
        uploaded_by: c.uploader_id,
        upload_key: crypto.randomUUID(),
        object_path: objectPath,
        original_filename: `${c.original_filename}-page-${page}.${extension}`,
        mime_type: mime,
        byte_size: bytes.byteLength,
        checksum_sha256: createHash("sha256").update(bytes).digest("hex"),
        default_alt_text: `Source page ${page} from ${c.original_filename}; review the extracted academic figure and provide specific alt text before publication.`,
        status: "ACTIVE",
        source_contribution_id: c.id,
        source_page: page,
        width: width ?? null,
        height: height ?? null,
      })
      .select("id")
      .single(),
  ) as { id: string };
  return inserted.id;
}
export async function processOne(jobId: string): Promise<{ done: boolean; wait: number }> {
  const db = createAdminClient();
  const job = check(
    await db.rpc("claim_document_job", { p_id: jobId, p_worker: crypto.randomUUID() }),
  ) as Job | null;
  if (!job) {
    const state = check(
      await db.from("processing_jobs").select("status,available_at").eq("id", jobId).single(),
    ) as { status: string; available_at: string };
    return {
      done: terminal.has(state.status),
      wait: Math.max(2000, Date.parse(state.available_at) - Date.now()),
    };
  }
  const cursor = { ...job.cursor };
  const artifacts: Record<string, unknown>[] = [];
  const staged: Stage[] = [];
  const reading: Record<string, unknown>[] = [];
  const updates: Record<string, unknown> = { state: "PROCESSING" };
  let status = "READY";
  try {
    if (job.kind !== "DOCUMENT") throw new Error("UNSUPPORTED_JOB_KIND");
    const c = check(
      await db.from("contributions").select("*").eq("id", job.contribution_id).single(),
    ) as Contribution;
    if (!c.finalized_at) throw new Error("ORIGINAL_NOT_FINALIZED");
    const signed = check(await db.storage.from(c.bucket).createSignedUrl(c.object_path, 120));
    const size = Number(c.byte_size);
    if (cursor.step === "HASH") {
      const offset = cursor.offset ?? 0;
      const bytes = await readRange(signed.signedUrl, offset, 4 * 1024 * 1024, size);
      const hash = await createSHA256();
      if (cursor.hash_state) hash.load(Buffer.from(cursor.hash_state, "base64"));
      else hash.init();
      hash.update(bytes);
      cursor.offset = offset + bytes.length;
      if (cursor.offset === size) {
        updates.checksum = hash.digest("hex");
        cursor.step = "INSPECT";
        cursor.offset = 0;
        delete cursor.hash_state;
      } else cursor.hash_state = Buffer.from(hash.save()).toString("base64");
    } else if (cursor.step === "INSPECT") {
      const bytes = await readRange(signed.signedUrl, 0, 4096, size);
      if (!inspectSignature(bytes, c.mime_type)) throw new Error("FILE_SIGNATURE_MISMATCH");
      cursor.step = c.mime_type === "text/csv" ? "CSV" : "EXTRACT";
      cursor.page = 1;
      cursor.offset = 0;
    } else if (cursor.step === "CSV") {
      const offset = cursor.offset ?? 0;
      const old = Buffer.from(cursor.buffer ?? "", "base64");
      const pending = csvRecords(old, 101, offset >= size);
      const more =
        pending.records.length < 100 && offset < size
          ? await readRange(signed.signedUrl, offset, 256 * 1024, size)
          : new Uint8Array();
      cursor.offset = offset + more.length;
      const combined = Buffer.concat([old, more]);
      const split = csvRecords(combined, 101, cursor.offset >= size);
      const rows = [...split.records];
      if (!cursor.header) {
        const header = rows.shift();
        if (!header) throw new Error("CSV_HEADER_MISSING");
        cursor.header = new TextDecoder().decode(header).replace(/\r?\n$/, "");
        cursor.row = 2;
      }
      const batch = rows.splice(0, 100);
      cursor.buffer = Buffer.concat([...rows, split.carry]).toString("base64");
      const names = [
        "exam_programs",
        "exam_groups",
        "subjects",
        "units",
        "topics",
        "exam_blueprints",
        "blueprint_allocations",
      ];
      const all = await Promise.all(names.map((n) => db.from(n).select("*").limit(1000)));
      const values = all.map(check);
      const taxonomy = {
        programs: values[0],
        groups: values[1],
        subjects: values[2],
        units: values[3],
        topics: values[4],
        blueprints: values[5],
        allocations: values[6],
      } as unknown as Taxonomy;
      const parsed = parseCanonicalCsv(
        `${cursor.header}\n${new TextDecoder().decode(Buffer.concat(batch))}`,
        taxonomy,
      );
      for (const row of parsed) {
        const number = (cursor.row ?? 2) + row.row - 2;
        staged.push({
          key: `${job.id}:csv:${number}`,
          page: 1,
          row: number,
          data: {
            ...row.data,
            provenance: {
              ...row.data.provenance,
              contribution_id: c.id,
              filename: c.original_filename,
              row: number,
            },
          },
          errors: row.errors,
          duplicate: null,
        });
      }
      cursor.row = (cursor.row ?? 2) + parsed.length;
      if (cursor.offset === size && !cursor.buffer) {
        status = "SUCCEEDED";
        updates.state = "EXTRACTED";
      }
    } else {
      const page = cursor.page ?? 1;
      let text = "";
      let last = true;
      let method = "EMBEDDED_TEXT";
      const mediaAssetIds: string[] = [];
      if (c.mime_type === "application/pdf") {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const task = pdfjs.getDocument({
          url: signed.signedUrl,
          rangeChunkSize: 1024 * 1024,
          disableAutoFetch: true,
          disableStream: true,
          useSystemFonts: true,
        });
        const watchdog = setTimeout(() => void task.destroy(), 35000);
        try {
          const doc = await task.promise;
          cursor.pages = doc.numPages;
          const p = await doc.getPage(page);
          const content = await p.getTextContent();
          text = content.items
            .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : ""))
            .join("");
          last = page === doc.numPages;
          if (text.trim().length < 32) {
            const { createCanvas } = await import("@napi-rs/canvas");
            const raw = p.getViewport({ scale: 1 });
            const scale = Math.min(2, Math.sqrt(6000000 / (raw.width * raw.height)));
            const view = p.getViewport({ scale });
            const canvas = createCanvas(Math.ceil(view.width), Math.ceil(view.height));
            await p.render({
              canvas: canvas as unknown as HTMLCanvasElement,
              canvasContext: canvas.getContext("2d") as unknown as CanvasRenderingContext2D,
              viewport: view,
            }).promise;
            const rendered = canvas.toBuffer("image/png");
            mediaAssetIds.push(
              await preserveExtractedMedia(
                db,
                c,
                page,
                rendered,
                "image/png",
                canvas.width,
                canvas.height,
              ),
            );
            try {
              text = await transcribeImage(canvas.toDataURL("image/png"), c.uploader_id);
              method = "VISION";
            } catch {
              cursor.partial = true;
              method = "OCR_UNAVAILABLE";
            }
          }
        } finally {
          clearTimeout(watchdog);
          await task.destroy();
        }
      } else if (c.mime_type.startsWith("image/")) {
        if (size > 16 * 1024 * 1024) throw new Error("IMAGE_EXCEEDS_VISION_STEP_BUDGET");
        const bytes = await readRange(signed.signedUrl, 0, size, size);
        mediaAssetIds.push(await preserveExtractedMedia(db, c, 1, bytes, c.mime_type));
        text = await transcribeImage(
          `data:${c.mime_type};base64,${Buffer.from(bytes).toString("base64")}`,
          c.uploader_id,
        );
        method = "VISION";
      } else if (c.mime_type.includes("wordprocessingml")) {
        if (size > 32 * 1024 * 1024) throw new Error("DOCX_EXCEEDS_EXTRACTION_STEP_BUDGET");
        const bytes = await readRange(signed.signedUrl, 0, size, size);
        inspectDocxArchive(bytes);
        const mammoth = await import("mammoth");
        const embedded: Array<{ bytes: Buffer; mime: string }> = [];
        await mammoth.convertToHtml(
          { buffer: Buffer.from(bytes) },
          {
            convertImage: mammoth.images.imgElement(async (image) => {
              embedded.push({
                bytes: Buffer.from(await image.read("base64"), "base64"),
                mime: image.contentType,
              });
              return { src: "preserved-for-review" };
            }),
          },
        );
        if (embedded.length) {
          cursor.pages = embedded.length;
          const current = embedded[page - 1];
          if (!current) throw new Error("DOCX_IMAGE_PAGE_MISSING");
          const { createCanvas, loadImage } = await import("@napi-rs/canvas");
          const source = await loadImage(current.bytes);
          const scale = Math.min(1, Math.sqrt(6000000 / (source.width * source.height)));
          const canvas = createCanvas(
            Math.max(1, Math.ceil(source.width * scale)),
            Math.max(1, Math.ceil(source.height * scale)),
          );
          canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
          const rendered = canvas.toBuffer("image/png");
          mediaAssetIds.push(
            await preserveExtractedMedia(
              db,
              c,
              page,
              rendered,
              "image/png",
              canvas.width,
              canvas.height,
            ),
          );
          last = page >= embedded.length;
          try {
            text = await transcribeImage(canvas.toDataURL("image/png"), c.uploader_id);
            method = "VISION";
          } catch {
            cursor.partial = true;
            method = "OCR_UNAVAILABLE";
          }
        } else {
          const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
          const chunks = chunkText(result.value, 24000);
          cursor.pages = chunks.length;
          text = chunks[page - 1] ?? "";
          last = page >= chunks.length;
        }
      } else {
        const offset = cursor.offset ?? 0;
        const bytes = await readRange(signed.signedUrl, offset, 24000, size);
        const combined = Buffer.concat([Buffer.from(cursor.buffer ?? "", "base64"), bytes]);
        last = offset + bytes.length === size;
        let end = combined.length;
        if (!last) {
          while (end > 0 && (combined[end - 1]! & 0xc0) === 0x80) end--;
          if (end > 0 && combined[end - 1]! >= 0xc0) end--;
          else if (end === combined.length && combined[end - 1]! >= 0xc0) end--;
        }
        text = new TextDecoder("utf-8", { fatal: true }).decode(combined.subarray(0, end));
        cursor.buffer = combined.subarray(end).toString("base64");
        cursor.offset = offset + bytes.length;
      }
      if (mediaAssetIds.length)
        artifacts.push({
          page,
          chunk: 0,
          type: "PAGE_MEDIA",
          content: null,
          data: { media_asset_ids: mediaAssetIds, requires_human_verification: true },
        });
      const chunks = chunkText(text);
      for (const [i, content] of chunks.entries()) {
        artifacts.push({ page, chunk: i, type: "PAGE_TEXT", content, data: { method } });
        reading.push({ page, chunk: i, content, title: c.original_filename });
      }
      if (!text.trim())
        artifacts.push({
          page,
          chunk: 0,
          type: "PAGE_ERROR",
          content: "No readable text; original page retained.",
          data: { method },
        });
      const keys = detectAnswerKeys(text);
      if (keys.length)
        artifacts.push({
          page,
          chunk: 0,
          type: "ANSWER_KEYS",
          content: null,
          data: { keys, requires_review: true },
        });
      if (
        ["QUESTIONS", "SOLUTIONS", "ANSWER_KEYS", "PAST_PAPER", "MOCK_TEST"].includes(c.category)
      ) {
        const detected = detectQuestions(`${cursor.carry ?? ""}\n${text}`, last);
        for (const [i, q] of detected.questions.entries())
          staged.push({
            key: `${job.id}:page:${page}:${i}`,
            page: cursor.carry && i === 0 ? (cursor.carry_page ?? page) : page,
            row: null,
            data: {
              ...q.data,
              source_type: c.category === "PAST_PAPER" ? "PAST_PAPER" : "CONTRIBUTION",
              source_document: c.original_filename,
              source_page: page,
              provenance: {
                contribution_id: c.id,
                filename: c.original_filename,
                page,
                method,
                media_asset_ids: mediaAssetIds,
                requires_human_verification: true,
              },
            },
            errors: q.errors,
            duplicate: null,
          });
        if (detected.carry.length > 48000) throw new Error("QUESTION_SPANS_EXCEED_STEP_BUDGET");
        cursor.carry = detected.carry;
        cursor.carry_page = page;
      }
      cursor.page = page + 1;
      if (last) {
        status = cursor.partial ? "NEEDS_REVIEW" : "SUCCEEDED";
        updates.state = cursor.partial ? "PARTIAL" : "EXTRACTED";
      }
    }
    for (const item of staged) {
      const d = item.data;
      const fields = ["question_text", "option_a", "option_b", "option_c", "option_d"].map((k) =>
        String(d[k] ?? "").trim(),
      );
      if (fields.every(Boolean)) {
        const hash = createHash("sha256")
          .update(fields.join("|").toLowerCase().replace(/\s+/g, " "))
          .digest("hex");
        const duplicate = check(
          await db.from("questions").select("id").eq("content_fingerprint", hash).maybeSingle(),
        ) as { id: string } | null;
        item.duplicate = duplicate?.id ?? null;
      }
    }
    check(
      await db.rpc("commit_document_step", {
        p_job: job.id,
        p_lease: job.lease_token,
        p_cursor: cursor,
        p_status: status,
        p_artifacts: artifacts,
        p_staged: staged,
        p_reading: reading,
        p_updates: updates,
      }),
    );
    return { done: status !== "READY", wait: 1000 };
  } catch (error) {
    const message = error instanceof Error ? error.message : "PROCESSING_ERROR";
    const safe = /^[A-Z_]+$/.test(message) ? message : "DOCUMENT_PROCESSING_FAILED";
    const review =
      safe.includes("BUDGET") || safe === "FILE_SIGNATURE_MISMATCH" || safe === "AI_NOT_CONFIGURED";
    check(
      await db.rpc("checkpoint_job", {
        p_id: job.id,
        p_lease: job.lease_token,
        p_cursor: job.cursor,
        p_status: review ? "NEEDS_REVIEW" : "RETRY",
        p_error: {
          code: safe,
          message:
            "Processing stopped at the saved checkpoint. The original and completed chunks are retained.",
        },
      }),
    );
    return {
      done: review || job.step_attempts >= job.max_attempts,
      wait: Math.min(3600000, 30000 * 2 ** job.step_attempts),
    };
  }
}
