# Authorized external ingestion

Migration 0013 adds admin-managed Meta Page sources, authorization state, cursor, timestamps, errors, runs and deduplicated items. Authenticated Cron queues enabled/authorized sources. A bounded Workflow step calls Graph API, advances the cursor, preserves post provenance, fingerprints content and stages detected questions for human review. No scraping or private-group access exists.

Live Meta verification requires an approved Page token.
