# Architecture

- Runtime: Next.js App Router on Vercel; no persistent server process.
- Database: Supabase PostgreSQL is the only application database.
- Identity: Supabase Auth with SSR cookie handling; authorization is enforced in PostgreSQL RLS and server routes.
- Files: private Supabase Storage; large uploads go directly/resumably from browser to Storage and never traverse a Vercel request body.
- Async work: idempotent PostgreSQL job records processed in bounded steps by authenticated Vercel Cron triggers. Long OCR/AI workloads require an external compute provider behind the job interface; Vercel functions only orchestrate bounded work.
- Realtime: limited to contribution/processing status and selected community events.
- Migrations: `supabase/migrations` is the only authoritative lineage.
