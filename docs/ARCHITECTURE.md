# Architecture

- Next.js App Router runs on Vercel without a persistent server.
- Supabase PostgreSQL is the only application database; Supabase Auth supplies identity and RLS enforces ownership.
- Browser uploads use TUS directly to private Supabase Storage. Originals do not cross a Vercel function body.
- Vercel routes execute one bounded unit; PostgreSQL stores leases, checkpoints, retries, partial artifacts and dead-letter state.
- Vercel Cron authenticates and picks up bounded database jobs without a permanent worker.
- AI and Meta are server-only adapters with explicit unavailable/error behavior.
- `supabase/migrations` is the sole migration lineage. Migration 0015 is an idempotent drift repair for environments where the 0007 identity/security statements were not fully applied. Migration 0016 adds approval-gated Admin requests: registration metadata can request access but cannot assign a role, and only a trusted SUPER_ADMIN RPC can approve it.
- Authentication routing reads the authoritative `profiles.role` on the server. The `(student)` route group uses `AppShell` only for STUDENT identities; `/admin` uses a separate `AdminShell`, with server guards for staff, ADMIN and SUPER_ADMIN capabilities. Navigation visibility mirrors—but never replaces—those server and database checks.
