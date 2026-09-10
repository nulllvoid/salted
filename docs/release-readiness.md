# Salted release handoff — 11 September 2026

The user-facing app overhaul is implemented. Three database migrations have been applied directly to the linked production project, with entries in `supabase_migrations.schema_migrations`. Existing households were preserved. This is not yet a signed or distributed mobile release.

## Delivered

- Shared database meal schedules replace device-local meal labels. Today and Tomorrow selections scope the menu, attendance and cook message to a specific meal and date.
- Household creation is transactional. Invite-code joining is functional and idempotent; direct self-joining with a guessed household UUID is blocked.
- The complete menu is visible together, with labelled servings, explicit Add actions, accessible quantity controls and a persistent grocery action.
- Grocery ingredients are merged across the selected household's meals for the selected date. Matching names/units are summed before rounding; ticking an item updates all contributing dish rows in one transaction. Open menus are labelled provisional. This intentionally uses the selected calendar date, rather than the earlier design's rolling 24-hour window.
- Shared buttons, cards, form fields, toggles, loading states, actionable errors and bounded layouts are used across onboarding and the primary screens. Search is debounced and discards stale results. Failed writes do not claim success.
- Meal schedules, headcounts and dietary constraints are enforced on the backend. Attendance cannot be written into another household's meal, and fallback claims are serialized.
- Six existing breakfast dishes and fourteen light-meal dishes have been curated into appropriate suggestion pools. All 486 production recipes have ingredients. The breakfast pool remains small; expanding it requires further recipe curation.
- Meal suitability is reproducible from `data/meal-bases.json`; the three existing production accompaniments and their ingredients are preserved in `data/accompaniment-seed.json` so a fresh seed no longer skips all pairing rows.
- Cook messages distinguish prepared/manual messages from sent/delivered messages, and provide manual WhatsApp and copy actions. Merely opening WhatsApp does not mark a message sent.
- New vector-source branding supplies the app icon, adaptive icon, splash and favicon. EAS preview APK and production AAB profiles are included; Android application ID is `com.flatmeal.salted`.

## Production migrations

1. `20260910000000_user_facing_households`: create/join/checklist RPCs and membership/poll permissions.
2. `20260911000000_meal_integrity`: dietary/headcount/attendance validation, schedule checks, serialized fallback and recipe meal tags.
3. `20260911000001_scheduler_window`: menu opening is limited to 24 hours ahead, matching the deployed scheduler's today/tomorrow scan.

Each migration passed a rollback-only test against production before it was committed. These checks cover creation, membership isolation, invite idempotency, forbidden direct joins, poll-status permissions, dietary vetoes, serving limits and invalid schedules.

## Verification

- `npx tsc --noEmit` and `npx expo lint` from `app/`.
- `npm run test:unit`: 31 tests across scheduling, selection, payloads, eligibility and grocery aggregation.
- `npx expo export --platform all`: web static output and Android/iOS Hermes bundles. This verifies bundling, not native device behaviour or signed binaries.
- `node --env-file=app/.env scripts/verify-release.mjs` from the repository root with Expo web running at localhost:8081. This creates two isolated test identities and one household, uses authenticated requests against the real backend, and removes its own fixtures in `finally`. It exercises joining, adding/searching dishes, failed-write recovery, meal-specific attendance, grocery checks, persisted schedules and manual cook-message presentation. It sends no email or WhatsApp messages.
- Screenshots are written to ignored `app/e2e/artifacts/` for phone and desktop inspection.
- `node --env-file=app/.env scripts/check-bundle-secrets.mjs` checks exported files for configured private credentials without printing their values.

The live test uses short-lived test sessions signed with the configured project JWT secret, following the existing repository test approach. It does not verify an interactive Google OAuth round-trip. Google is enabled in the production auth settings; Apple is disabled and hidden unless explicitly enabled in public app configuration.

## Remaining before public distribution

1. **WhatsApp automation:** the existing Edge Function's live BSP send is still unimplemented. Manual sending of prepared messages is usable. Configure the chosen BSP and approved templates, implement its send/webhook adapter, and test actual delivery before promising automatic delivery.
2. **Mobile signing/distribution:** EAS reports `Not logged in`. Log in to the intended Expo account, link an EAS project, configure the two `EXPO_PUBLIC_SUPABASE_*` build environment variables, then build the preview APK and verify Google sign-in and keyboard/safe-area behaviour on an Android device. No signed APK/AAB was produced or submitted.
3. **Edge deployment credentials:** the configured Supabase management token returned HTTP 401. Database migrations were deployed using the configured database credentials with CA-verified TLS, so this did not block the database work. Renew the management token before deploying Edge changes. The existing scheduler endpoints still have JWT verification disabled; authenticate scheduler calls before opening the service broadly.

Do not ship `SUPA_JWT`, database passwords, management tokens or service-role credentials in the app. Only the public Supabase URL and anon key belong in its build environment.

## Database tooling

`scripts/db.mjs` reads the existing linked pooler URL and configured password, with certificate validation enabled. The ignored CA file is `supabase/.temp/root.crt`, downloaded from Supabase's certificate distribution endpoint. `scripts/migrate.mjs <migration-file>` dry-runs an unapplied migration with tests and rollback; add `--apply` only to commit it and its migration-history record. It refuses to apply the same version twice.
