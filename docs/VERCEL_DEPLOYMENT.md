# Vercel deployment

Required production values are `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`, and optional AI/Meta values. Apply all 16 migrations in order, configure Auth redirects and confirm the private contributions bucket before deploying.

Both Cron routes require `Authorization: Bearer <CRON_SECRET>`. They claim bounded PostgreSQL jobs and rely on persisted checkpoints/idempotency for retry and crash recovery; no permanent worker is required. After deployment, test Auth, two-user isolation, scoring, TUS upload/finalization, job checkpoints, signed download, CSV, AI fallback and authorized ingestion.

Production currently responds at `https://myquiz-production.vercel.app`. Deployment `dpl_42JQRi6848iZecy5oukG6QFNTAYS`, created from clean local commit `e07abb32d57ab35b1d7b780270dee5bf053e1371` at 2026-09-11 02:03:07 UTC, was reported Ready and Current by Vercel. Anonymous landing/register and redirects from `/dashboard`, `/admin`, `/admin/users` and `/admin/admin-requests` were reverified against this deployment. Migrations through 0016 are live.

Production browser verification confirmed a normal Student account uses the Student shell and the designated `SUPER_ADMIN` account uses the separate Administration shell. Super Admin `/dashboard` access redirects to `/admin`; direct `/admin/users`, `/admin/admin-requests` and `/admin/audit` access succeeds with no Student navigation. Controlled pending, rejected and ordinary approved-ADMIN journeys remain a separate live-verification gap; their database and route behavior is covered by the local integration/security suite.
