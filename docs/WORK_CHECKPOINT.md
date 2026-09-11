# Work checkpoint

## 2026-09-11 role-based application-shell fix

The local application now resolves the authoritative database role after login, email confirmation and authenticated visits to `/`. STUDENT accounts land at `/dashboard`; MODERATOR, ADMIN and SUPER_ADMIN land at `/admin`. Pending and rejected Admin requests remain STUDENT and receive explicit non-authorization messages. The student route-group layout now rejects staff roles back to `/admin`, so the former student-first shell is no longer the default administration experience.

`AdminShell` is separate from `AppShell`. It identifies MYQUIZ ADMINISTRATION, shows role-authorized management navigation, and exposes Super-Admin-only Users & Roles, Admin Requests / Approvals and Audit / Activity pages. Direct route checks protect Super-Admin-only pages and Admin-only taxonomy, CSV, source and analytics pages. User enumeration and access changes now both require SUPER_ADMIN in the API. The Admin dashboard derives all displayed totals from PostgreSQL queries; it contains no fixed production metrics.

Local verification for this change: **43 Vitest passed, 0 failed** (24 database/integration/security and 19 unit/property/source), all **16 migrations passed**, TypeScript passed, ESLint passed, production build passed, npm production audit found 0 vulnerabilities, secret scan passed and Git whitespace passed. Migration 0016 was already applied live; no new migration was required. Deployment of this role-shell revision and credential-backed production role journeys remain pending.

## 2026-09-10 Admin approval update

Registration now offers Student and Admin-request account types. Admin selection is stored only as a pending request; the Auth trigger still creates every public registrant as STUDENT. Migration 0016 adds RLS-protected requests, a SUPER_ADMIN-only approve/reject RPC, and tightens all ordinary role changes so ADMIN cannot grant ADMIN or MODERATOR access. Pending and rejected users retain student access and receive a clear dashboard message when signing in or attempting `/admin`.

Migration 0016 was applied successfully to the live Supabase project. The user-designated existing account was promoted to `SUPER_ADMIN` through trusted database administration after explicit action-time confirmation; the query returned `SUPER_ADMIN`. No other role was modified, and no personal email or credential was committed. Local verification after this change: **37 Vitest passed, 0 failed; 16 migrations passed; TypeScript passed; ESLint passed; production build passed; npm production audit found 0 vulnerabilities; Git whitespace passed.** Deployment and browser verification of this new UI remain pending until the new commit is deployed.

## Last completed task

Completed a live Supabase identity/RLS verification run against project `pfrmuxkescvstqwwbgsv` and the deployed application at `https://myquiz-production.vercel.app`. The run discovered that the production database was missing the identity RPCs and execute revocations from migration 0007 even though the earlier lineage had been reported applied. Migration 0015 now repairs that state idempotently; its equivalent statements were applied to the live database and verified before the isolation tests continued.

Three controlled identities were used: two default-role students and one account promoted to ADMIN only through trusted database administration. No existing user role was changed. The controlled question/attempt data proved server-authoritative selection and scoring: Student A received `1.00` for a correct answer and Student B received `-0.25` for an incorrect answer. History records, bookmarks, flashcards, contribution metadata and a community comment persisted in PostgreSQL.

After verification and explicit user confirmation, all three controlled identities and their tagged question, attempts, bookmarks, flashcards, comments, contribution metadata, progression/audit rows and related records were permanently removed. A post-cleanup query confirmed zero remaining auth users, profiles, entitlements, attempts, bookmarks, flashcards, comments, XP events, contributions, matching Storage objects and tagged questions. No legitimate production data was targeted.

Live RLS results were symmetric for Student A and Student B: own attempt/contribution/bookmark/flashcard rows were visible (`1` each) and the other student's rows were invisible (`0` each). Profile and entitlement visibility was likewise `1` own / `0` other. Cross-user `get_attempt` calls returned `Attempt not found`; direct score mutation, direct role mutation and direct answer-key reads were denied. Student self-promotion through `set_user_access` returned `Admin access required`. Anonymous table access was denied. The Admin identity could see both controlled attempts/contributions and the controlled published question without changing their ownership.

Live PostgreSQL plans confirmed the eligible-question lookup used `questions_eligible_idx` (0.144 ms execution on the controlled dataset) and the FSRS due query used `flashcards_due_idx` (0.256 ms). The attempt-history query completed in 0.432 ms. These are small controlled-dataset measurements, not load-test claims.

## Executed gates

- Vitest: **43 passed, 0 failed** (24 database/integration/security tests and 19 unit/property/source tests).
- Migrations: **all 16 executed successfully** against PGlite, including the Admin approval migration.
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
4. Deploy the repository's Admin approval implementation and verify registration choice, pending/rejected messaging and SUPER_ADMIN review UI in Production.
5. Verify optional live AI and authorized Meta providers when credentials are available.

## External blockers

- Supabase and the Production deployment are reachable, but no reusable application-session credentials were retained for the temporary identities. This blocks credential-backed browser CRUD, real TUS upload and signed-download verification.
- A local Playwright Chromium executable is still unavailable.
- Live AI and Meta checks require provider credentials.
