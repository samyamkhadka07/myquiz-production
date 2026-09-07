# Vercel deployment

1. Create a clean Supabase project and apply migrations in order.
2. Configure Auth redirect URLs for local, Preview and Production origins; disable any unneeded providers.
3. Link this repository to Vercel and set public Supabase URL/anon key plus server-only service role, cron secret and optional provider secrets separately for Preview/Production.
4. Deploy Preview, execute migrations against the intended environment, run smoke/security tests, then promote a pinned commit.
5. Verify Cron authorization, direct/resumable uploads, private originals, signed staff downloads and bounded job checkpoints from production logs.

Never expose the service-role key, reuse production secrets in untrusted previews, or mark deployment live-verified before two-user isolation and critical flows are exercised.
