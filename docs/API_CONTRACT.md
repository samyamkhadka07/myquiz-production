# API contract

All mutation routes use authenticated Supabase identity, Zod validation, CSRF-safe same-site requests and structured errors (`code`, `message`, optional field issues, request ID). Student attempt APIs never accept a score or correct answer. Start creates an immutable ordered question snapshot; save-answer accepts only attempt/question/selected option/response time; complete scores atomically on the server and is idempotent.

Contribution upload follows create-metadata → authorized direct/resumable Storage upload → finalize/checksum → enqueue. The complete binary never crosses a Vercel function body. Admin download resolves the trusted object path from PostgreSQL, authorizes staff, emits an audit record, then returns a short-lived signed URL.

Staff endpoints expose staged editing/import/rejection/revision, processing retry, canonical CSV export, user access, report resolution, contribution review, authorized sources and manual ingestion. Cron endpoints require a server-only bearer secret and execute bounded checkpointed work.

Live verification confirmed that authenticated quiz RPCs are not executable by `anon`/`public`, cross-user attempt identifiers resolve as not found, and direct score/role/answer-key table access is denied. Credential-backed HTTP verification of signed downloads and TUS finalization remains pending.
