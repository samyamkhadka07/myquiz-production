# Database

`supabase/migrations` is the sole migration lineage. Migration 0001 creates identity, entitlements, versioned academic taxonomy and blueprints with RLS. Migration 0002 creates canonical questions, contributions, attempts and bookmarks with ownership policies. Migration 0003 seeds the exact Group I allocation from syllabus page 4 and fails if the allocation does not total 200.

The browser uses the anonymous key and RLS. The service-role key is reserved for narrowly scoped server orchestration and must never reach client code. Later migrations must be append-only once applied to production.
