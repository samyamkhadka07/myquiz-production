# Authorized external ingestion

Only official provider APIs and explicitly authorized sources are allowed. Meta ingestion is limited to approved Page access through Graph API; no scraping, session reuse, private-group bypass, anti-bot circumvention or rate-limit evasion.

Vercel Cron authenticates a short trigger that creates incremental jobs from each source cursor. Bounded workers fetch, deduplicate and checkpoint content. Every normalized question retains platform, source/Page ID, post ID/URL/date, media identity, page/image and retrieval time before entering staging.
