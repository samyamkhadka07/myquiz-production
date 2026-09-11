# Admin Function Matrix

Audit date: 2026-09-11. Evidence is repository code, SQL migrations, automated tests, and (after deployment) Production browser verification. Documentation is not treated as implementation evidence.

## Pre-change route audit

| Label | Previous URL / component | Previous purpose | Duplicate or incomplete | Backend connected | Fix required |
|---|---|---|---|---|---|
| Admin Dashboard | `/admin` | PostgreSQL counts | Operational sections missing | Yes | Add activity, attention, processing and bank health |
| Question Management | `/admin/questions` | Question editor/list | Filters/workflow separation limited | Yes | Retain canonical bank; move queues to dedicated routes |
| Question Verification | `/admin/questions?stage=PENDING_REVIEW` | Same QuestionEditor | Reused page | Yes | Dedicated review queue |
| Question Publication | `/admin/questions?stage=VERIFIED` | Same QuestionEditor | Reused page | Yes | Dedicated release queue |
| MEC Taxonomy & Blueprints | `/admin/taxonomy` | Read-only taxonomy | Two concepts merged | Yes | Split blueprints |
| Reading Materials | `/admin/contributions` | File library | Wrong duplicate route | Yes | Dedicated chunk review/publication |
| Ingestion Runs | `/admin/sources#ingestion-runs` | Small nested run dump | Anchor, not workspace | Yes | Dedicated run history |
| Comments / Moderation | `/admin/moderation` | Open report list | Reports merged | Yes | Comment console plus distinct Reports |
| Reports | `/admin/moderation` | Same report list | Duplicate route | Yes | Dedicated incident queue |
| AI Review / Usage | `/admin/analytics` | Generic table counts | Wrong duplicate route | Partly | Dedicated provider/usage health |
| Admin Analytics | `/admin/analytics` | Six table counts | Too generic | Yes | Learning/content aggregate page |
| Admin Profile | `/admin/profile` + `ProfileForm` | Student profile | Included Exam Program and Target Score | Yes | Dedicated read-only-role Admin form |

## Current implementation

| Admin module | Route | Purpose | Database | APIs / actions | Authorization | Tested | Live verified | Status |
|---|---|---|---|---|---|---|---|---|
| Admin Dashboard | `/admin` | Operational command center | profiles, questions, contributions, jobs, reports, sources, runs, attempts, audit | Navigation to queues | Staff server guard + RLS | Build/test | Pending deployment | Implemented |
| Question Management | `/admin/questions` | Canonical question bank | questions + taxonomy | Create, edit, review, verify, publish, archive | Staff API + SQL functions | Automated | Pending | Implemented |
| Verification Queue | `/admin/questions/verification` | Answer/content review | questions | Edit, verify, needs review path | Staff API + lifecycle SQL | Automated | Pending | Implemented |
| Publication Queue | `/admin/questions/publication` | Verified draft release | questions | Publish/archive | Staff API + lifecycle SQL | Automated | Pending | Implemented |
| MEC Taxonomy | `/admin/taxonomy` | Syllabus hierarchy | groups/subjects/units/topics | Inspect/search via browser | Admin server guard + read RLS | Build | Pending | Implemented, read-only by design |
| Exam Blueprints | `/admin/blueprints` | Versioned exam constraints and allocation validation | exam_blueprints/allocations | Inspect validation | Admin server guard + published RLS | Build | Pending | Implemented, migration-controlled |
| Mnemonics | `/admin/mnemonics` | Review extracted mnemonic artifacts | processing_artifacts | Inspect candidate/source metadata | Admin guard + staff RLS | Build | Pending | Implemented; empty until candidates exist |
| Reading Materials | `/admin/reading-materials` | Student library publication | reading_chunks/contributions | Publish/archive with audit | Staff API + `review_reading` | DB tests/build | Pending | Implemented |
| Contributions | `/admin/contributions` | Original file library/review | contributions/jobs | View, download, process/review | Staff API + Storage policies | Existing tests | Existing baseline | Implemented |
| Document Processing | `/admin/processing` | Durable job monitor | processing_jobs/artifacts | Retry | Staff API + SQL lease model | Existing tests | Existing baseline | Implemented |
| Staged Questions | `/admin/staged` | Extraction review | staged_items | Import, reject, needs revision | Staff API + SQL review function | Existing tests | Existing baseline | Implemented |
| CSV Import / Export | `/admin/csv` | Canonical interchange | contributions/staged/questions | TUS contribution import; protected export | Admin API | Existing tests | Existing baseline | Implemented |
| Duplicate Review | `/admin/duplicates` | Candidate/canonical comparison | staged_items/questions | Import/keep candidate, reject, revise | Staff API + RLS | Build | Pending | Implemented |
| External Sources | `/admin/sources` | Authorized source registry | external_sources | Add/test/queue authorized scan | Admin API | Existing tests | Existing baseline | Implemented |
| Ingestion Runs | `/admin/ingestion` | Durable scan reports | ingestion_runs/sources | Inspect detailed run evidence | Admin guard + RLS | Build | Pending | Implemented |
| Users & Roles | `/admin/users` | User access | profiles/entitlements | Role/tier update excluding SUPER_ADMIN | Super Admin API | Role tests | Existing baseline | Implemented |
| Admin Requests | `/admin/admin-requests` | Approval history/queue | admin_role_requests | Approve/reject | Super Admin RPC | Role tests | Existing baseline | Implemented |
| Comments / Moderation | `/admin/moderation` | Content console | comments/reports | Hide, restore, delete | Staff API + moderation RPC | Build | Pending | Implemented |
| Reports | `/admin/reports` | Incident queue/history | comment_reports/comments | Dismiss, hide, delete | Staff API + report RPC | Existing tests | Pending | Implemented |
| AI Review / Usage | `/admin/ai-usage` | Provider health and review workload | ai_usage_logs | Inspect safe usage/error metadata | Admin guard + RLS | Build | Pending | Implemented |
| Admin Analytics | `/admin/analytics` | Aggregate learning/content health | attempts/questions/games/flashcards/contributions | Aggregate analysis | Admin guard + RLS | Build | Pending | Implemented |
| Audit / Activity | `/admin/audit` | Trusted activity ledger | audit_events | Inspect safe event metadata | Super Admin guard + RLS | Role tests | Existing baseline | Implemented |
| Admin Profile | `/admin/profile` | Administrative identity/preferences | profiles/audit_events | Update name/timezone only | Staff RPC; role immutable | DB tests | Pending | Implemented |

