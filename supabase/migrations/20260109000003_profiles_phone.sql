-- profiles.phone: the member's own contact number, collected at signup
-- alongside name + email + password. Distinct from cooks.phone (the
-- household cook's number) and not used as an auth identifier — auth
-- stays email+password via Supabase Auth (see
-- app/src/app/onboarding/index.tsx).
--
-- Reconstructed from the remote migration history: this was applied to the
-- live project but its file was never committed, which blocked `db push`
-- with LegacyDbPushMissingLocalError. Body copied verbatim from
-- supabase_migrations.schema_migrations.statements for version
-- 20260109000003, so local history now matches what the database actually
-- has rather than papering over the gap with `migration repair`.

alter table profiles add column phone text;
