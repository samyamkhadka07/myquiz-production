# Work checkpoint

## Last completed task

Completed a live Supabase identity/RLS verification run against project `pfrmuxkescvstqwwbgsv` and the deployed application at `https://myquiz-production.vercel.app`. The run discovered that the production database was missing the identity RPCs and execute revocations from migration 0007 even though the earlier lineage had been reported applied. Migration 0015 now repairs that state idempotently; its equivalent statements were applied to the live database and verified before the isolation tests continued.

Three controlled identities were used: two default-role students and one account promoted to ADMIN only through trusted database administration. No existing user role was changed. The controlled question/attempt data proved server-authoritative selection and scoring: Student A received `1.00` for a correct answer and Student B received `-0.25` for an incorrect answer. History records, bookmarks, flashcards, contribution metadata and a community comment persisted in PostgreSQL.

After verification and explicit user confirmation, all three controlled identities and their tagged question, attempts, bookmarks, flashcards, comments, contribution metadata, progression/audit rows and related records were permanently removed. A post-cleanup query confirmed zero remaining auth users, profiles, entitlements, attempts, bookmarks, flashcards, comments, XP events, contributions, matching Storage objects and tagged questions. No legitimate production data was targeted.

Live RLS results were symmetric for Student A and Student B: own attempt/contribution/bookmark/flashcard rows were visible (`1` each) and the other student's rows were invisible (`0` each). Profile and entitlement visibility was likewise `1` own / `0` other. Cross-user `get_attempt` calls returned `Attempt not found`; direct score mutation, direct role mutation and direct answer-key reads were denied. Student self-promotion through `set_user_access` returned `Admin access required`. Anonymous table access was denied. The Admin identity could see both controlled attempts/contributions and the controlled published question without changing their ownership.

Live PostgreSQL plans confirmed the eligible-question lookup used `questions_eligible_idx` (0.144 ms execution on the controlled dataset) and the FSRS due query used `flashcards_due_idx` (0.256 ms). The attempt-history query completed in 0.432 ms. These are small controlled-dataset measurements, not load-test claims.

## Executed gates

- Vitest: **33 passed, 0 failed** (20 database/integration/security tests and 13 unit/property/source tests).
- Migrations: **all 15 executed successfully** against PGlite after adding the live security repair.
- TypeScript: passed.
- ESLint: passed.
- Next.js production build: passed; 12 static pages and all dynamic routes compiled.
- Git whitespace: passed.
- Dependency audit: **0 vulnerabilities** after replacing the Workflow SDK with PostgreSQL leases/checkpoints and bounded Vercel Cron execution.
- Browser E2E: the packaged Playwright run remains **0 passed, 3 infrastructure failures** because the local Chromium binary is unavailable. Separately, seven browser checks executed against Production and passed after correcting the landing assertion: landing, login form, registration form, and anonymous redirects for dashboard, admin, contributions and reading.
- Production secret exposure check: eight client JavaScript bundles were inspected; neither privileged variable name nor a service-role/JWT-like secret pattern was present. Both Cron endpoints returned HTTP 401 without the bearer secret.

## Next unfinished work

1. Run credential-backed browser flows for Student A, Student B and Admin; the generated temporary passwords were intentionally not persisted and were unavailable after the browser session reset.
2. Upload an actual object through the student TUS flow and verify private Storage plus the signed-download route. Only contribution metadata/RLS was verified in this run.
3. Execute the packaged Playwright suite when a compatible local browser is available.
4. Deploy the repository's final migration/documentation commit; the current Production deployment predates migration 0015, although the equivalent database repair is live.
5. Verify optional live AI and authorized Meta providers when credentials are available.

## External blockers

- Supabase and the Production deployment are reachable, but no reusable application-session credentials were retained for the temporary identities. This blocks credential-backed browser CRUD, real TUS upload and signed-download verification.
- A local Playwright Chromium executable is still unavailable.
- Live AI and Meta checks require provider credentials.
