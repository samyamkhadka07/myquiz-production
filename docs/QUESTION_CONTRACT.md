# Canonical question contract

A question has exactly four options and an optional answer key while staged. Taxonomy is relational; provenance remains structured JSON plus searchable source columns. `content_fingerprint` is globally unique for idempotency. A question cannot enter VERIFIED/PUBLISHED lifecycle states without an established answer, verifier and timestamp. Student eligibility requires all three: lifecycle `PUBLISHED`, verification status `VERIFIED`, publication status `PUBLISHED`.

No OCR, CSV, manual editor, AI or external-ingestion path may create a parallel question shape. Each must normalize into `public.questions` and preserve the source link.
