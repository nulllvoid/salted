# Salted release handoff — 11 September 2026, updated 19 September 2026

The 11 September record below is preserved as written; see "Update — 19
September 2026" for cook dispatch sending, which changed items 1 and 3 of
"Remaining before public distribution".

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

## Update — 19 September 2026: cook dispatch sending

Design record: `docs/superpowers/specs/2026-09-16-cook-dispatch-sending-design.md`.

- **Meta Cloud API direct, no BSP.** Flatmeal sends one utility message per flat per meal and uses none of the inbox, campaign builder or storefront integration a BSP's ₹999–2399/month buys, while the Meta app, webhook and template composition already existed. The send client is `supabase/functions/_shared/whatsapp.ts`, deliberately domain-agnostic so the decision is one file to revisit. This supersedes `docs/06`'s original "pick AiSensy or Interakt" step.
- **`dispatch_cook`'s live branch is implemented.** It fills the `cook_menu` template and stores Meta's message id in `dispatch_log.bsp_message_id`, which is what `wa_webhook` needs to correlate delivery callbacks — until now it received them and matched no rows. A send failure is logged with Meta's own error and never retried, matching `DISPATCH_GRACE_MINUTES`: the poll flips to `dispatched` either way and a late cook message is worse than none.
- **The message carries dish counts and the flat note only.** Measured against real `dispatch_log` rows, the full payload runs 580–3783 characters against Meta's 1024 limit, applied to the rendered message; ingredients and method could not fit without truncating the instructions. The cook already knows how to cook, and ingredients are the flatmates' concern. Rendered against real carts the new message is 50–260 characters. Consequently `recipe_translations`, live method translation and the `reviewed_at = null` review workflow all leave the dispatch path, and `docs/06`'s ~80-translation quality gate is no longer a pilot blocker.
- **Item-counted dishes** (`recipes.is_item_counted`, migration `20260916000000`): cart quantity counts pieces for roti and dosa, so two people can order five rotis. Portions keep the headcount cap, which is a real typo guard. The cap existed in three places — the `validate_cart_dish` trigger, the stepper's disabled state, and `setQuantity`'s re-fetched clamp — and the third silently rewrote every increment back to headcount until it was found by driving the running app; typecheck and the SQL tests both passed while it was broken. `scripts/verify-release.mjs` now guards it.
- **`wa_webhook` is deployed and verified** against the live endpoint: GET with the correct token echoes the challenge (200), a wrong token is refused (403), and an unsigned POST is refused (401). `WHATSAPP_WEBHOOK_VERIFY_TOKEN` and `META_APP_SECRET` are set as Edge Function secrets. See `docs/whatsapp-webhook-setup.md`.

Verification for this change: `npm run test:unit` 64 passed (11 new, written before the implementation and confirmed failing against it); `npx tsc --noEmit` and `npx expo lint` clean; `deno check` on `dispatch_cook` shows the same five pre-existing `TS2339` PostgREST-embed errors before and after; `scripts/verify-release.mjs` passes end to end; `dispatch_cook` invoked live returns `{"processed":0,"failures":0,"mode":"mock"}` with nothing in `pipeline_errors`.

## Remaining before public distribution

1. **WhatsApp automation — now blocked on Meta provisioning, not code.** The send path exists end to end, but **no real send has ever run**: the adapter is unit-tested against an injected `fetch`, not against Meta. Only the test number exists (it reaches at most 5 pre-verified recipients) and the `cook_menu` template has not been submitted. Register a WhatsApp Business number, submit `cook_menu` for hi/kn/en and wait for approval, set the `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` Edge Function secrets, then test a real delivery to the test number before setting `DISPATCH_MODE=live`. Manual sending of prepared messages remains usable meanwhile.
2. **Mobile signing/distribution:** EAS reports `Not logged in`. Log in to the intended Expo account, link an EAS project, configure the two `EXPO_PUBLIC_SUPABASE_*` build environment variables, then build the preview APK and verify Google sign-in and keyboard/safe-area behaviour on an Android device. No signed APK/AAB was produced or submitted.
3. **Edge deployment credentials:** resolved on 18 September 2026 — a renewed personal access token restored Edge Function deploys, and `wa_webhook` and `dispatch_cook` were both deployed with it. Note the token is supplied per-command; the Windows-level `SUPABASE_ACCESS_TOKEN` may still hold the expired value, which the CLI prefers over its own stored credentials and which `supabase login` does not displace. The scheduler endpoints still have JWT verification disabled; authenticate scheduler calls before opening the service broadly.

Do not ship `SUPA_JWT`, database passwords, management tokens or service-role credentials in the app. Only the public Supabase URL and anon key belong in its build environment.

## Database tooling

`scripts/db.mjs` reads the existing linked pooler URL and configured password, with certificate validation enabled. The ignored CA file is `supabase/.temp/root.crt`, downloaded from Supabase's certificate distribution endpoint. `scripts/migrate.mjs <migration-file>` dry-runs an unapplied migration with tests and rollback; add `--apply` only to commit it and its migration-history record. It refuses to apply the same version twice.
