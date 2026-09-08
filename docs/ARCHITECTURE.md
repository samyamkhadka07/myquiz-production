# Architecture

- Next.js App Router runs on Vercel without a persistent server.
- Supabase PostgreSQL is the only application database; Supabase Auth supplies identity and RLS enforces ownership.
- Browser uploads use TUS directly to private Supabase Storage. Originals do not cross a Vercel function body.
- Vercel Workflow runs bounded, retryable document and external-ingestion steps; PostgreSQL stores checkpoints and partial artifacts.
- Vercel Cron only authenticates and queues bounded work.
- AI and Meta are server-only adapters with explicit unavailable/error behavior.
- `supabase/migrations` is the sole migration lineage.
