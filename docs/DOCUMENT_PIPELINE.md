# Durable document pipeline

Stages: upload → preserve original → inspect → embedded-text extraction → OCR/vision fallback → classify → bounded page/chunk work → detect questions/options/answers/solutions → MEC taxonomy classification → normalize → validate → duplicate check → stage → staff review → publish.

Each processing job has an idempotency key, cursor/checkpoint, bounded attempts, delayed retry, lock and persistent error. A worker handles at most five pages or 20 text chunks per invocation and checkpoints after each unit. Exponential retry is capped at five attempts; ambiguous academic content moves to manual review, while infrastructure exhaustion moves to dead letter. Partial artifacts remain recoverable. Missing answers are never fabricated.
