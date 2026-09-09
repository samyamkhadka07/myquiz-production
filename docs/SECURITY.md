# Security

Implemented controls include SSR identity validation, same-origin mutation checks, Zod payload validation, RLS, self-promotion prevention, immutable quiz snapshots, server scoring, answer-key isolation, private object policies, trusted-path signed downloads with audit events, CSV formula protection, authorized-source restrictions, fixed function search paths and server-only provider secrets.

Executed local database tests cover anonymous denial, Student A/B attempt and contribution isolation, role spoofing, score/answer tampering, premature answer leakage, contribution path enforcement and source-admin authorization.

A live Supabase run found and repaired a migration-lineage drift: production lacked the identity RPCs and default function execute revocations expected from 0007. Migration 0015 is the idempotent repair. Live checks after repair proved symmetric Student A/B isolation for profiles, entitlements, attempts, bookmarks, flashcards and contribution metadata; cross-user attempt IDs returned `Attempt not found`; direct score, role and answer-key access was denied; self-promotion was denied; anonymous attempt access was denied; and critical RPCs are executable by `authenticated` but not `anon` or `public`. Admin visibility was verified without altering student ownership.

Actual private Storage object upload, signed URL authorization/expiry, authenticated browser IDOR/XSS, and client-bundle secret inspection against a deployment containing the final commit remain release gates.

The current Production deployment's eight discovered client JavaScript bundles were scanned without printing bundle contents: no `SUPABASE_SERVICE_ROLE_KEY` or `CRON_SECRET` variable names, service-role key pattern, or JWT-like secret pattern was found. Both Cron endpoints returned HTTP 401 when called without authorization. This does not replace credential-backed positive-path Cron or signed-download verification.

The Workflow 4.x SDK was removed because its exact transitive pins retained high-severity `nanoid` and `undici` advisories and no compatible patched release was available. Durable execution now uses PostgreSQL job leases, idempotency keys, persisted checkpoints, bounded route invocations and authenticated Vercel Cron retry pickup. `npm audit --omit=dev --audit-level=high` reports **0 vulnerabilities**. Live Supabase RLS/Storage testing remains a release gate.
