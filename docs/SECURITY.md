# Security

Implemented controls include SSR identity validation, same-origin mutation checks, Zod payload validation, RLS, self-promotion prevention, immutable quiz snapshots, server scoring, answer-key isolation, private object policies, trusted-path signed downloads with audit events, CSV formula protection, authorized-source restrictions, fixed function search paths and server-only provider secrets.

Executed local database tests cover anonymous denial, Student A/B attempt and contribution isolation, role spoofing, score/answer tampering, premature answer leakage, contribution path enforcement and source-admin authorization. Live Supabase policy behavior, signed URLs, browser IDOR/XSS flows and production secret exposure remain unverified.

The dependency audit reports 16 transitive advisories in `workflow`; the offered fix is a breaking downgrade and was not applied.
