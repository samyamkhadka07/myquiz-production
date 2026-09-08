# Phase 0–28 evidence matrix

| Phase | Requirement | Designed | Implemented | Tested | Live verified | Evidence / blocker |
|---|---|---:|---:|---:|---:|---|
| 0 | Vercel-first foundation | Yes | Yes | Yes | No | Typecheck, lint and production build pass locally |
| 1 | Schema and RLS baseline | Yes | Yes | Partial | No | 12 migrations execute in PGlite; live Supabase RLS pending |
| 2 | MEC academic blueprints | Yes | Yes | Yes | No | Idempotent Groups I–IV seeds and allocation tests |
| 3 | Auth and roles | Yes | Yes | Partial | No | SSR flows/routes exist; live Auth and browser E2E pending |
| 4 | Canonical question bank/admin | Yes | Yes | Partial | No | Lifecycle RPCs and persistence tests; UI/API present |
| 5 | Quiz/attempts/review | Yes | Yes | Yes | No | DB tests cover selection, persistence, scoring and isolation |
| 6 | Dashboard/history/analytics | Yes | Yes | Partial | No | Real-data RPCs and dynamic routes; browser E2E pending |
| 7 | Recommendations/adaptive | Yes | Yes | Yes | No | Deterministic unit tests and server selection |
| 8 | FSRS flashcards | Yes | Yes | Partial | No | Scheduler tests and atomic review RPC; live persistence pending |
| 9 | Community/moderation | Yes | Yes | Partial | No | Schema/RPC/API/UI present; abuse E2E pending |
| 10 | XP/achievements/leaderboard | Yes | Yes | Partial | No | Server-authoritative schema/RPC/UI present |
| 11 | Entitlements | Yes | Yes | Partial | No | Server-side access RPCs; bypass testing incomplete |
| 12 | Contributions/private storage | Yes | Partial | Partial | No | Direct-upload/finalize primitives; user/admin UI unfinished |
| 13 | Document/OCR/reading pipeline | Yes | Partial | Partial | No | Bounded worker and extraction tests; live Storage/OCR pending |
| 14 | Canonical CSV | Yes | Partial | Yes | No | Parser/export tests pass; admin preview/confirm UI unfinished |
| 15 | AI abstraction/activities | Yes | Partial | Partial | No | Server-only adapter/log schema; activity UI/live provider pending |
| 16 | Authorized external ingestion | Yes | No | No | No | Meta authorization and implementation remain |
| 17–23 | Complete admin/student integration | Yes | Partial | Partial | No | Core routes exist; listed UI surfaces remain unfinished |
| 24 | Security gate | Yes | No | Partial | No | Ownership/answer-leakage tests pass; full audit pending |
| 25 | Performance gate | Yes | No | No | No | Initial indexes exist; measurement pending |
| 26 | Complete testing | Yes | No | Partial | No | 29 tests pass; browser/E2E/live suites incomplete |
| 27 | Vercel deployment | Yes | No | No | No | Local build passes; deployment pending |
| 28 | Final audit | Yes | No | No | No | Matrix records the current truthful state |
