# Contributions and private files

The original object is accepted and preserved before extraction. The trusted path is `contributions/{user_id}/{contribution_id}/{original_filename}`. PostgreSQL holds ownership, MIME, size, checksum, state and provenance; private Supabase Storage holds bytes. The bucket has no application-level 25 MB cap, but real Supabase plan and upload limits still apply.

The browser performs an authorized resumable/direct upload, then finalizes metadata. Finalization verifies the trusted path/object metadata and enqueues an idempotent job. OCR failure changes processing state but never rejects or removes a successfully stored original.

The student page shows persistent processing/review history. Staff can inspect contribution state and errors and obtain an audited two-minute signed URL. Extracted questions enter staged review; approved reading chunks alone appear in the reading room.
