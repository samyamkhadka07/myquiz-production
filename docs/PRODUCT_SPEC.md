# Product specification

MyQuiz is a dynamic MEC CEE preparation platform. PostgreSQL, Supabase Auth and private Storage are authoritative; the client never supplies scores, answer keys, ranks, XP or entitlements. Only VERIFIED and PUBLISHED questions enter normal tests.

The MEC 2026 Groups I–IV blueprints are normalized and idempotently seeded from the preserved syllabus. Student areas cover auth, tests/practice, results/review, history, bookmarks, analytics, recommendations, FSRS, community, progression, contribution uploads, reading and learning activities. Staff areas cover question lifecycle, taxonomy, users, moderation, contributions, processing/staging, CSV, authorized sources and analytics.

Registration offers Student or Admin-request account types. Choosing Admin never grants a role: the account is created as STUDENT with a pending request. Only a SUPER_ADMIN can approve that request and activate ADMIN access; pending and rejected users retain student access and receive an explicit status message when they sign in or try to open the administration area.
