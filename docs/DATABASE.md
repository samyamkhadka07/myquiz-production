# Database

Migrations 0001–0014 define profiles/roles/entitlements, MEC taxonomy and blueprints, canonical questions, immutable attempts, bookmarks, analytics/progression, FSRS, community, contributions/private-object metadata, processing artifacts/checkpoints, reading chunks, staged items, AI usage, external sources/items/runs, admin workflows and performance indexes. Migration 0015 idempotently repairs identity RPCs, question lifecycle validation, table privileges and function execute grants if an environment recorded 0007 without applying all of its statements.

Every user or staff data table has RLS. Security-definer functions use fixed search paths and validate identity/role. Correct-answer storage is not granted to students. External sources accept only authorized Meta Pages and preserve post/media/retrieval provenance.

The live Supabase environment received the 0015-equivalent repair and passed two-user RLS checks. Because it was applied interactively as equivalent idempotent statements, operators should still allow the authoritative 0015 file to run normally on the next migration deployment.
