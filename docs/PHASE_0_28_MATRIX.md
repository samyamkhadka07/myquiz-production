# Phase 0–28 evidence matrix

| Phase | Requirement | Designed | Implemented | Tested | Live verified | Evidence / blocker |
|---|---|---:|---:|---:|---:|---|
| 0–5 | Foundation, schema, MEC, auth, questions, quiz | Yes | Yes | Yes | Partial | Migrations 0001–0008 and 0015; live Admin publish, two authoritative attempts, `1.00`/`-0.25` scoring, cross-user IDOR denial; credential-backed browser quiz pending |
| 6–11 | Analytics, adaptive, FSRS, community, progression, entitlements | Yes | Yes | Partial | Partial | Migrations 0009–0010; live bookmark, flashcard and comment persistence; live FSRS scheduler/achievement UI and entitlement bypass checks remain |
| 12 | Contributions/private storage | Yes | Yes | Partial | Partial | 0011–0012; live contribution metadata showed symmetric 1-own/0-other RLS; actual private object/TUS and signed download pending |
| 13 | OCR/document/reading | Yes | Yes | Partial | No | bounded worker, staged/reading UI; provider/live files pending |
| 14 | CSV | Yes | Yes | Yes | No | canonical parser/export tests and admin export; credential-backed live import/export pending |
| 15 | AI | Yes | Yes | Partial | No | adapter, logging, fallback and activities; live key pending |
| 16 | Authorized external ingestion | Yes | Yes | Partial | No | 0013, Graph adapter, bounded Cron/PostgreSQL jobs/admin UI; live token pending |
| 17–23 | Complete student/admin integration | Yes | Partial | Partial | Partial | Production landing/auth surfaces and protected redirects verified; credential-backed browser mutations remain |
| 24 | Security gate | Yes | Partial | Partial | Partial | npm production audit 0; live A/B attempts, profiles, entitlements, bookmarks, flashcards and contribution metadata isolation passed; role/score/answer/anonymous denial passed; eight Production client bundles contained no privileged variable/secret pattern and unauthenticated Cron returned 401; live Storage/signed URL still pending |
| 25 | Performance gate | Yes | Partial | Partial | Partial | 0013 indexes plus live EXPLAIN evidence: eligible questions 0.144 ms using `questions_eligible_idx`; FSRS due 0.256 ms using `flashcards_due_idx`; history 0.432 ms on controlled data; load testing pending |
| 26 | Complete testing | Yes | No | Partial | Partial | 33 Vitest tests; 15 local migrations; seven Production browser smoke checks passed; packaged Playwright remains 0 passed/3 infrastructure failures |
| 27 | Vercel deployment | Yes | Yes | Partial | Partial | Production URL responds and protected redirects work; deployed source predates final 0015/docs commit and full authenticated smoke test is pending |
| 28 | Final audit | Yes | No | Partial | No | matrix updated with live evidence; unresolved browser/Storage/provider/cleanup gates remain |
