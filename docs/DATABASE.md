# Database

Migrations 0001–0014 define profiles/roles/entitlements, MEC taxonomy and blueprints, canonical questions, immutable attempts, bookmarks, analytics/progression, FSRS, community, contributions/private-object metadata, processing artifacts/checkpoints, reading chunks, staged items, AI usage, external sources/items/runs, admin workflows and performance indexes. Migration 0015 idempotently repairs identity RPCs, question lifecycle validation, table privileges and function execute grants if an environment recorded 0007 without applying all of its statements. Migration 0016 adds RLS-protected `admin_role_requests`, a SUPER_ADMIN-only decision RPC and a tightened user-access RPC.

Every user or staff data table has RLS. Security-definer functions use fixed search paths and validate identity/role. Correct-answer storage is not granted to students. External sources accept only authorized Meta Pages and preserve post/media/retrieval provenance.

The live Supabase environment received the 0015-equivalent repair and passed two-user RLS checks. Migration 0016 was applied to Production on 2026-09-10. The designated bootstrap account was promoted through trusted database administration and the returned role was verified as `SUPER_ADMIN`; its email is intentionally not stored in repository documentation.
