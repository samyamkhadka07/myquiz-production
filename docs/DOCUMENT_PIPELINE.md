# Durable document pipeline

Stages: upload → preserve original → inspect → embedded-text extraction → OCR/vision fallback → classify → bounded page/chunk work → detect questions/options/answers/solutions → MEC taxonomy classification → normalize → validate → duplicate check → stage → staff review → publish.

Each processing job has an idempotency key, cursor/checkpoint, bounded attempts, delayed retry, lease and persistent error. A step handles one PDF/DOCX logical page, up to 24 KB of text, up to 100 CSV rows, or a 4 MiB checksum range before atomically checkpointing. Retry delay is bounded and exhausted work moves to review/dead letter. Partial artifacts and the original remain recoverable. Missing answers are never fabricated.
