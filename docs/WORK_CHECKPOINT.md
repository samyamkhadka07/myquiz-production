# Work checkpoint

## 2026-09-14 production sync and Ashar workflow verification

The authoritative repository and deployed Production revision are now aligned at commit `6fc2d7c23a1921cf64c428742c19c4a5c6edebff`. GitHub repository `samyamkhadka07/myquiz-production` is the Vercel source of truth. Repository `samyamkhadka07/questions_mec` contains a byte-identical project/source tree, including the retained Ashar PDF and DOCX, as a secondary working copy. The temporary cross-repository workflow, repository secret and fine-grained GitHub token used for the one-time sync were removed and verified absent.

Supabase migration `0018_staged_publish_premium.sql` was applied once to Production after confirming migration `0017` was already present. Live validation confirmed the staged import/verify/publish RPC path, PostgreSQL Premium enforcement and exactly one protected permanent `SUPER_ADMIN`.

Vercel deployment `dpl_HgqoCdWsxmnokReNEX52VkNzfTLj` is Ready, Latest, Production and Current for exact commit `6fc2d7c23a1921cf64c428742c19c4a5c6edebff` at `https://myquiz-production.vercel.app`. Build logs show a successful Next.js production build. Fresh runtime evidence contained no Warning, Error or Fatal entries for the inspected Admin routes. Homepage returned 200, anonymous `/dashboard` redirected to `/login`, and unauthenticated document-processing Cron returned 401.

Red-Chrome verification confirmed the dedicated Administration shell and purpose-specific processing/staged controls. The retained Ashar job is currently `READY` at checkpoint `EXTRACT`, page 1, offset 0, with zero attempts, no lease, no error and no artifacts. The staged page currently reports no staged rows. The canonical question bank still visibly contains only the existing published SI-unit question; no Ashar question has been claimed as imported, verified or published.

The Ashar source has been extracted locally into 151 page images and OCR transcribed with orientation repair, but bulk publication remains academically unsafe. Each question must still be paired with its printed solution, OCR-corrected, mapped to taxonomy, supplied with correct-answer and option-by-option explanations, duplicate-checked and reviewed. Unreadable or diagram-dependent questions must remain `NEEDS_REVISION`. Do not replace this review with guessed answers or automatically publish OCR output.

Current local gate for the deployed change: TypeScript PASS, ESLint PASS, Vitest 51/51 PASS, production build PASS, production dependency audit 0 vulnerabilities, secret scan PASS and Git whitespace PASS.

## 2026-09-11 role-based application-shell fix

The local application now resolves the authoritative database role after login, email confirmation and authenticated visits to `/`. STUDENT accounts land at `/dashboard`; MODERATOR, ADMIN and SUPER_ADMIN land at `/admin`. Pending and rejected Admin requests remain STUDENT and receive explicit non-authorization messages. The student route-group layout now rejects staff roles back to `/admin`, so the former student-first shell is no longer the default administration experience.

`AdminShell` is separate from `AppShell`. It identifies MYQUIZ ADMINISTRATION, shows role-authorized management navigation, and exposes Super-Admin-only Users & Roles, Admin Requests / Approvals and Audit / Activity pages. Direct route checks protect Super-Admin-only pages and Admin-only taxonomy, CSV, source and analytics pages. User enumeration and access changes now both require SUPER_ADMIN in the API. The Admin dashboard derives all displayed totals from PostgreSQL queries; it contains no fixed production metrics.

Local verification for this change: **43 Vitest passed, 0 failed** (24 database/integration/security and 19 unit/property/source), all **16 migrations passed**, TypeScript passed, ESLint passed, production build passed, npm production audit found 0 vulnerabilities, secret scan passed and Git whitespace passed. Migration 0016 was already applied live; no new migration was required.

The role-shell revision was deployed to Production as Vercel deployment `dpl_42JQRi6848iZecy5oukG6QFNTAYS` at **2026-09-11 02:03:07 UTC**. The deployment was created from clean local commit `e07abb32d57ab35b1d7b780270dee5bf053e1371` and Vercel reported it Ready and Current on `https://myquiz-production.vercel.app`. Fresh Production checks confirmed the Student/Admin registration choices, anonymous redirects from `/dashboard`, `/admin`, `/admin/users` and `/admin/admin-requests`, Student login to the Student shell, and the designated `SUPER_ADMIN` login to the dedicated Administration shell. Direct `/dashboard` access by the Super Admin redirects to `/admin`; `/admin/users`, `/admin/admin-requests` and `/admin/audit` load with the Administration navigation and no Student navigation. The live Admin dashboard returned PostgreSQL-backed metrics, and the Users page rendered the permanent Super Admin as protected.

During verification, a read-only production query found that the earlier reported bootstrap had not persisted: zero profiles held `SUPER_ADMIN`. After explicit action-time confirmation, trusted database administration updated only the designated existing Auth identity. The verification query returned exactly one matching designated `SUPER_ADMIN`. No other profile role was changed.

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
4. Live-verify the pending, rejected and approved-ADMIN journeys with controlled accounts; the registration choice and Super Admin review UI are deployed, but those state transitions were not executed in this browser run.
5. Verify optional live AI and authorized Meta providers when credentials are available.

## External blockers

- Supabase and the Production deployment are reachable, but no reusable application-session credentials were retained for the temporary identities. This blocks credential-backed browser CRUD, real TUS upload and signed-download verification.
- A local Playwright Chromium executable is still unavailable.
- Live AI and Meta checks require provider credentials.
## 2026-09-11 Admin separation and student engagement checkpoint

- Pre-change Admin route/component/data-source audit completed; duplicate and merged navigation routes were identified in source.
- Dedicated Admin routes added for verification, publication, blueprints, mnemonics, reading materials, duplicates, reports, ingestion runs and AI usage.
- Admin Profile is now separate from Student Profile and accepts only display name/timezone; role and protected Super Admin status are read-only.
- Migration `0017_admin_engagement.sql` adds RLS-protected learning-game sessions/items, persisted daily plan items and narrowly scoped RPCs.
- Student Overview now derives next-best action, daily plan, mastery and trend guidance from the learner’s actual state.
- Mistake Center and five persistent learning modes were added; learning sessions are explicitly isolated from official test scoring.
- Local verification at this checkpoint: TypeScript PASS, ESLint PASS, Vitest 49 PASS / 0 FAIL, 17 migrations PASS, Production build PASS.
- Production migration/deployment and final browser audit remain required before either new acceptance status can be marked PASS.
## 2026-09-13 Ashar ingestion and workflow repair checkpoint

- Red-Chrome production audit confirmed migration `0017_admin_engagement.sql` is already present (`learning_game_sessions` and `update_admin_profile` exist).
- Production retains exactly one `SUPER_ADMIN`.
- The Ashar PDF contribution is approved and retained, but its durable job is `READY` at the `INSPECT` checkpoint. It has produced 0 staged and 0 canonical questions.
- Production currently contains 1 canonical/published question. The 755 other pending staged rows are unrelated to the Ashar contribution and visibly include corrupt OCR, so they were not published.
- Migration `0018_staged_publish_premium.sql` adds an audited staged `IMPORT_VERIFY` / `IMPORT_PUBLISH` path with existing database lifecycle validation and Premium enforcement for Premium game modes.
- The Admin processing page now exposes a server-authorized bounded `run`/resume action and shows durable checkpoints, lease state, errors, and artifacts.
- The Student shell now shows the entitlement tier and Premium availability; Premium game controls are visibly locked for Free users and enforced in both the API and PostgreSQL.
- Local gate: TypeScript PASS, ESLint PASS, Vitest 51/51 PASS, production build PASS after replacing a corrupt local `.next` cache, production dependency audit 0 vulnerabilities.
