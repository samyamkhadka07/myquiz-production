# Security

Implemented controls include SSR identity validation, same-origin mutation checks, Zod payload validation, RLS, self-promotion prevention, immutable quiz snapshots, server scoring, answer-key isolation, private object policies, trusted-path signed downloads with audit events, CSV formula protection, authorized-source restrictions, fixed function search paths and server-only provider secrets.

Executed local database tests cover anonymous denial, Student A/B attempt and contribution isolation, role spoofing, score/answer tampering, premature answer leakage, contribution path enforcement and source-admin authorization. Live Supabase policy behavior, signed URLs, browser IDOR/XSS flows and production secret exposure remain unverified.

The Workflow 4.x SDK was removed because its exact transitive pins retained high-severity `nanoid` and `undici` advisories and no compatible patched release was available. Durable execution now uses PostgreSQL job leases, idempotency keys, persisted checkpoints, bounded route invocations and authenticated Vercel Cron retry pickup. `npm audit --omit=dev --audit-level=high` reports **0 vulnerabilities**. Live Supabase RLS/Storage testing remains a release gate.
