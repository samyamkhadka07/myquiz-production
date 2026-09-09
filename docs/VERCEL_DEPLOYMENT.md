# Vercel deployment

Required production values are `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`, and optional AI/Meta values. Apply all 15 migrations in order, configure Auth redirects and confirm the private contributions bucket before deploying.

Both Cron routes require `Authorization: Bearer <CRON_SECRET>`. They claim bounded PostgreSQL jobs and rely on persisted checkpoints/idempotency for retry and crash recovery; no permanent worker is required. After deployment, test Auth, two-user isolation, scoring, TUS upload/finalization, job checkpoints, signed download, CSV, AI fallback and authorized ingestion.

Production currently responds at `https://myquiz-production.vercel.app`. Anonymous landing/login/register and redirects from dashboard, admin, contributions and reading were browser-verified. The deployed application predates the final migration 0015/documentation commit; the 0015-equivalent database repair is live, but a final source deployment and authenticated browser smoke run remain required.
