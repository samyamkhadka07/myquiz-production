# Phase 0–28 evidence matrix

| Phase | Requirement | Designed | Implemented | Tested | Live verified | Evidence / blocker |
|---|---|---:|---:|---:|---:|---|
| 0–5 | Foundation, schema, MEC, auth, questions, quiz | Yes | Yes | Yes | Partial | Migrations 0001–0008, 0015 and 0016; 0016 Admin requests are locally tested and live-applied; live Admin publish, two authoritative attempts, `1.00`/`-0.25` scoring and cross-user IDOR denial; credential-backed browser quiz pending |
| 6–11 | Analytics, adaptive, FSRS, community, progression, entitlements | Yes | Yes | Partial | Partial | Migrations 0009–0010; live bookmark, flashcard and comment persistence; live FSRS scheduler/achievement UI and entitlement bypass checks remain |
| 12 | Contributions/private storage | Yes | Yes | Partial | Partial | 0011–0012; live contribution metadata showed symmetric 1-own/0-other RLS; actual private object/TUS and signed download pending |
| 13 | OCR/document/reading | Yes | Yes | Partial | No | bounded worker, staged/reading UI; provider/live files pending |
| 14 | CSV | Yes | Yes | Yes | No | canonical parser/export tests and admin export; credential-backed live import/export pending |
| 15 | AI | Yes | Yes | Partial | No | adapter, logging, fallback and activities; live key pending |
| 16 | Authorized external ingestion | Yes | Yes | Partial | No | 0013, Graph adapter, bounded Cron/PostgreSQL jobs/admin UI; live token pending |
| 17–23 | Complete student/admin integration | Yes | Partial | Partial | Partial | Registration offers Student/Admin request choices; distinct Student/Admin shells, role-aware login/root redirects, live Admin metrics and dedicated request/user/audit pages implemented; credential-backed browser mutations and deployment of this revision remain |
| 24 | Security gate | Yes | Partial | Partial | Partial | npm production audit 0; local tests prove request metadata cannot self-promote, ADMIN cannot approve/grant roles, rejection stays non-privileged and SUPER_ADMIN cannot self-demote; user enumeration and privileged Admin routes tightened server-side; Production 0016/trusted bootstrap and prior A/B isolation are live, but new deployment and live Storage/signed URL remain |
| 25 | Performance gate | Yes | Partial | Partial | Partial | 0013 indexes plus live EXPLAIN evidence: eligible questions 0.144 ms using `questions_eligible_idx`; FSRS due 0.256 ms using `flashcards_due_idx`; history 0.432 ms on controlled data; load testing pending |
| 26 | Complete testing | Yes | No | Partial | Partial | 43 Vitest tests (24 database/integration/security, 19 unit/property/source); 16 local migrations; seven earlier Production browser smoke checks passed; packaged Playwright remains 0 passed/3 infrastructure failures and new role journeys are not yet live-executed |
| 27 | Vercel deployment | Yes | Yes | Partial | Partial | Production URL responds and protected redirects work; deployed source predates the distinct Admin-shell revision and full authenticated role smoke test is pending |
| 28 | Final audit | Yes | No | Partial | No | matrix updated with live evidence; unresolved browser/Storage/provider/cleanup gates remain |
