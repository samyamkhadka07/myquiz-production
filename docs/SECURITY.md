# Security baseline

RLS is enabled when every user-data table is introduced. Browser role hiding is cosmetic. Staff authorization must be checked on the server and again by RLS. Correct-answer columns are not directly granted to anonymous/authenticated clients; attempt creation and scoring will use security-definer RPCs with fixed search paths. Private objects are addressed by trusted database paths and exposed to authorized staff only through short-lived signed URLs with audit events.

Production gates still required: two-user isolation, anonymous matrix, IDOR, role spoofing, score tampering, answer leakage, entitlement bypass, upload policy, signed URL, CSV, ingestion, XSS, secret scan and service-role exposure tests.
