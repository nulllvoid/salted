# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Read this before doing anything. Then read `docs/02-prd.md` and `docs/03-mvp-spec.md`.

## Repo status

Wired to a real Supabase project (`pcmtsfcjzoivagpslpch`) — not a local/mock setup. `/app` queries Supabase directly (auth, the shared cart, grocery list, settings all live). `/supabase`'s `create_poll`, `close_poll`, and `dispatch_cook` Edge Functions are fully implemented (dietary veto, 10-day exclusion, variety heuristic, per-dish ingredient scaling, translation cache with graceful fallback) and deployed; `dispatch_cook`'s live BSP send is still unimplemented (mock mode only — no BSP account provisioned yet). pg_cron + pg_net are enabled and scheduled to invoke all three functions every 15 minutes (`supabase/migrations/20260108000003_pg_cron.sql`); each function self-selects which **meals** are due by comparing `flat_meals` wall-clock times against current IST. The scheduling unit is a row in `flat_meals`, not a flat: a flat serving breakfast and dinner gets two independent polls a day. A meal's poll can open on the day *before* it is served, so open/dispatch moments are computed backwards from `serve_time` (`supabase/functions/_shared/ist-time.ts`). All three stages **latch** on "due yet and not yet done" rather than "due in this exact 15-minute tick", so a tick lost to a failed cron run or an edited poll time is recovered on the next one instead of dropped for the day.

Dinner selection is a **shared, multi-item cart**, not a single-winner vote: `create_poll` seeds up to 3 main-course suggestions plus up to 3 accompaniment suggestions each day; any flatmate can tap a suggestion to add it to `cart_items` (one row per poll+recipe, not per-user) at a quantity defaulting to headcount, and any flatmate can edit any line's quantity or remove it while the poll is `open`. `close_poll` just locks the cart (flips status, enforced via RLS) — there is no winner, tie-break, or vote tally anywhere in the pipeline anymore. `dispatch_cook` composes one message covering every cart line, each dish scaled by its own cart quantity.

```
/app          Expo app (Expo Router, TypeScript). app/CLAUDE.md is a one-line
              pointer to app/AGENTS.md, which says only "read the Expo 57 docs
              at https://docs.expo.dev/versions/v57.0.0/ before writing code" —
              there is no app-level architecture doc; this file is it.
/supabase     migrations/ (from docs/05-schema.sql + RLS + pg_cron), functions/ (create_poll, close_poll, dispatch_cook implemented; wa_webhook still a stub), seed/ (CSV loader), tests/ (rollback-only SQL assertions run by scripts/migrate.mjs)
/scripts      repo tooling: db.mjs, migrate.mjs, verify-release.mjs, check-bundle-secrets.mjs, scrape-recipes/
/data         recipe + ingredient CSVs (source of truth for seeding)
/docs         product/architecture docs
```

`docs/release-readiness.md` (11 Sep 2026) is the most recent status-of-record and
is more current than this section when the two disagree.

### Commands (run from `/app`)

- `npm install` — install deps
- `npx expo start` — dev server (press `a` for Android emulator, `w` for web)
- `npx tsc --noEmit` — typecheck
- `npx expo lint` — lint
- Copy `app/.env.example` to `app/.env` and fill in `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` before the app can reach a real Supabase project. `src/lib/supabase.ts` throws at import time if these are missing.
- `npm run test:unit` — pure unit tests over the Edge Functions' shared logic (`app/e2e/unit/`), run through Playwright with no browser or dev server. Deno is not installed in this environment, so this is how `supabase/functions/**` gets tested; specs import the function `.ts` modules directly. ~31 tests, seconds to run — **the default test command; run it after any change to `supabase/functions/**` or `src/lib/`.**
- `npm run test:e2e` — Playwright browser tests against the live project (boots Expo on 8081; much slower). Serial by design (`workers: 1`): every spec shares one flat and one poll-per-day row, so parallelism corrupts state. Needs `SUPA_JWT` in `app/.env` — it forges sessions rather than driving magic-link email, which is undeliverable on this project. See `app/e2e/README.md`.
- Single test: `npx playwright test --config=e2e/unit/playwright.config.ts <file>` (add `-g "<title>"` for one case). Same shape for `e2e/playwright.config.ts`.
- `npm run test:e2e:typecheck` — typechecks the e2e suite (separate tsconfig from the app).

### Release verification (run from repo root, not `/app`)

These are the actual pre-release gate — `docs/release-readiness.md` records the last full pass.

- `node --env-file=app/.env scripts/verify-release.mjs` — isolated live-backend smoke test against Expo web on :8081. Creates its own two identities + household, exercises join/cart/attendance/groceries/schedules/cook-handoff, writes screenshots to `app/e2e/artifacts/`, and deletes its own fixtures in `finally`. Sends no email or WhatsApp.
- `node --env-file=app/.env scripts/check-bundle-secrets.mjs` — scans `app/dist` for configured private credentials (never printing them). Run after `npx expo export`.

### Supabase (linked to the live project — most work happens against it directly, not local)

- Project ref `pcmtsfcjzoivagpslpch`. The Supabase CLI (`npx supabase`) works against it without extra login in this environment.
- **Two paths to the database, and the CLI one is currently degraded.** As of 11 Sep 2026 the configured Supabase *management token* returns HTTP 401, so Edge Function deploys are blocked until it is renewed; database work goes through the direct-Postgres scripts below instead. Prefer them:
  - `node --env-file=app/.env scripts/db.mjs "<sql>"` (or `--file <path>`) — ad-hoc query over the linked pooler with CA-verified TLS. Reads `supabase/.temp/pooler-url` + `supabase/.temp/root.crt` (both gitignored) and `SUPABASE_DB_PASSWORD`; never prints connection strings.
  - `node --env-file=app/.env scripts/migrate.mjs <migration-file>` — **dry-runs** the migration inside a transaction, executes `supabase/tests/user-facing.sql` (plus `meal-integrity.sql` for versions ≥ `20260911000000`), then rolls everything back. Add `--apply` only to commit it *and* its `supabase_migrations.schema_migrations` row. Refuses to apply a version twice. Every production migration in this repo passed a rollback-only run before being committed — keep that habit.
- `npx supabase db push` / `npx supabase db query --linked "<sql>"` still work for straightforward cases, but note the migrations applied via `migrate.mjs` are recorded by that script, not by the CLI.
- `npx supabase functions deploy <name> --project-ref pcmtsfcjzoivagpslpch` deploys a single Edge Function; all three (`create_poll`, `close_poll`, `dispatch_cook`) have `verify_jwt = false` (see `supabase/config.toml`), so they can be curled directly with no auth header for manual testing.
- Seed script: `npx tsx supabase/seed/seed-recipes.ts` (needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` env vars — not available in this dev environment; new recipe/seed data has instead been inserted via `db query` SQL directly against the live project when needed).
- Local Supabase (`supabase start`) is not used in this workflow — `supabase/config.toml` exists but development happens against the live project.

## App architecture (`/app/src`)

Expo Router, file-routed from `src/app`. `_layout.tsx` wraps everything in
`ActiveGroupProvider`; `index.tsx` and `(tabs)/_layout.tsx` are the auth/onboarding
gates (no session → `/onboarding`; session but no households → `/onboarding/choose`).

**`ActiveGroupProvider` (`contexts/active-group.tsx`) is the app's central selection
state, and most data hooks are keyed off it.** It holds three things at once, and all
three are load-bearing:

- **active household** — a user can belong to several; the Today screen shows a chip switcher when `groups.length > 1`.
- **active meal** — defaults to `nextMeal()` by serve time, switchable when the household has more than one.
- **day offset** — Today vs Tomorrow, since a poll may open the day before it is served. `pollDate` is derived, never stored.

Anything scoped to "which cart am I looking at" must read these rather than assuming
today's dinner for a single flat. Screens remount on `${group}:${meal}:${pollDate}`
so stale state can't bleed across a switch.

**Vocabulary split — expect both, translate at the boundary.** The database and Edge
Functions say `flats` / `flat_members` / `flat_meals`; the UI layer says household /
group (`useMyGroups`, `GroupSummary`, `create_household`, `join_household`). This is
deliberate — the user-facing rename landed without a schema rename — so a hook
typically selects `flat_members` and returns `groups`. Don't "fix" one side to match
the other; keep the seam at the hook.

**Data fetching** goes through `useResource(key, fetcher)` (`hooks/use-resource.ts`):
keyed caching so a household/meal switch blanks stale data, a monotonic sequence
counter so a slow response can't overwrite a newer one, plus a 60s refresh and a
refetch on app foreground. `useTodayCart` layers Supabase Realtime on top
(`cart_items`, `activity_log`, `daily_polls` status, `day_attendance`) — read the
channel-teardown comment there before touching it; reusing a still-registered channel
topic throws at runtime.

Writes are mostly direct PostgREST calls, except where RLS deliberately forbids the
obvious path: an empty cart at lock time uses the `take_fallback_cart_item`
security-definer RPC, because `cart_items` writes require `status = 'open'` and that
screen only appears once the poll is `closed`.

## Doc reading order

| Path | Purpose |
|---|---|
| `docs/01-research-original.md` | Founder's original long-term vision (v5+). Sections marked ⚠️ are explicitly deferred/corrected for v1 — don't build from this file directly, cross-check against `02-prd.md` |
| `docs/02-prd.md` | Product requirements — problem, personas, exhaustive MVP scope (§4) and out-of-scope (§5) |
| `docs/03-mvp-spec.md` | Screen-by-screen spec, flows, edge cases, the daily server pipeline |
| `docs/04-architecture.md` | Tech stack, target repo layout, key decisions, dispatch sequence diagram |
| `docs/05-schema.sql` | Postgres schema — **source of truth for the data model** |
| `docs/06-whatsapp-integration.md` | BSP setup, Hindi/Kannada/English message templates, dispatch composition pipeline |
| `docs/07-roadmap-and-pilot.md` | 4-week build plan, pilot success metrics, decision gates |

## What this product is

Flatmates in Indian metros (pilot: Bengaluru) share a domestic cook. The app removes the daily "what's for dinner" coordination burden:

1. **09:00** — app creates a daily suggestion list: up to 3 curated main dishes plus up to 3 accompaniments (filtered by flat's dietary tags, no repeats within 10 days).
2. Flatmates tap suggestions to add them to a shared cart (async, edits visible to everyone live). Any member can adjust any dish's quantity or remove it. "I'm out today" toggle adjusts headcount, which is also the default/cap for cart quantities.
3. **11:00** — the cart locks (no winner to pick — whatever's in the cart is tonight's menu).
4. App renders the grocery list, each dish's ingredients scaled by its own cart quantity; a flatmate ticks off what's already in the kitchen and shares the rest to WhatsApp / copies it.
5. **16:00** — every cart dish's name + quantity + scaled ingredients + notes are translated to the cook's language and sent via WhatsApp Business API (through a BSP).

The clock times above describe the default dinner shape. They are per-meal settings on
`flat_meals`, not flat-wide constants — see Conventions — and a household with several
meals runs this loop once per meal, on each meal's own times.

The users are NOT cooks. They know dish names, not ingredients. The ingredient data in our curated recipe DB is what makes the grocery list possible — there is no NLP/recipe-parsing anywhere.

## Stack (fixed — do not substitute)

- **App:** Expo (React Native) + TypeScript. Distribution: EAS Build APK links for pilot (Android-first), TestFlight later. EAS Update for OTA fixes.
- **Backend:** Supabase — Postgres, Auth (phone/OTP or magic link), Realtime (live cart updates), Edge Functions + pg_cron (suggestion generation, cart lock, cook dispatch).
- **WhatsApp:** BSP (AiSensy or Interakt) calling Meta WhatsApp Business API. Utility templates only. See `docs/06-whatsapp-integration.md`.
- **Translation:** Google Cloud Translate v1 (Hindi, Kannada first). TTS voice notes (Sarvam AI / Google TTS) are a stretch goal, week 4 only.

## Hard scope guardrails (v1)

DO NOT build, stub, or scaffold:
- Digital pantry / inventory tracking (humans tick a checklist instead)
- Quick-commerce cart APIs or price scraping (Blinkit/Zepto have no public partner APIs; at most, open their search page via URL scheme for an item)
- ML/collaborative-filtering recommender (v1 selection = tag filter + rotation + simple randomization)
- Expense splitting / ledger (users already have Splitwise)
- Cook-facing app or two-way cook chatbot (one-way dispatch only in v1; cook replies land in the flat's normal WhatsApp group)
- iOS store release

## Conventions

- Schema changes: edit `docs/05-schema.sql` first, generate migration, then code against it.
- All user-visible times are IST (Asia/Kolkata). Poll times are configured **per meal** on `flat_meals` (`serve_time`, `open_offset_min`, `close_time`, `dispatch_offset_min`), defaults equivalent to 09:00 create / 11:00 close / 16:00 dispatch for a 20:30 dinner. `flats.poll_open_time` / `poll_close_time` / `dispatch_time` still exist and are still read by the app, but the Edge Functions no longer use them — part 3 migrates the UI and drops them.
- Ingredient quantities are stored per-person; UI multiplies by each cart line's own quantity (which defaults to, and is capped by, current headcount — not a single flat-wide multiplier, since each dish in the cart can have a different quantity). Units must be purchasable (pieces, g, ml, packets). Spices/staples flagged `is_staple = true` and rendered as a single "check you have: …" line, not in the buy list.
- Recipe instruction text is written for the cook, imperative, plain English; translation happens at dispatch time, never stored pre-translated (except optional ingredient name_hi/name_kn columns for list readability).
- WhatsApp dispatch must be mockable: `DISPATCH_MODE=mock|live` env; mock logs payloads to `dispatch_log` without calling the BSP.
- Keep the app to its current surface: two tabs (Today / Settings), three stack routes off them (`grocery-list`, `cook-message-preview` modal, `who-is-eating` modal), plus the `onboarding/` flow. Push back on screen sprawl — a new *screen* needs justification; a new section on an existing screen usually doesn't.
- RLS on every flat-scoped table: members can read/write only their own flat (`flat_id` match). `recipes`/`recipe_ingredients`/`recipe_translations` are global read-only to authenticated users; writes are service-role only.
- Poll creation is deterministic and idempotent: option selection is seeded by `(flat_id, date)`, and `daily_polls` is keyed `unique (flat_id, poll_date, flat_meal_id)` — re-running `create_poll` for a flat/meal/day must not change or duplicate results.
- **Every pipeline stage resolves its poll by the exact `(flat_id, poll_date, flat_meal_id)` key, never by "the latest open/closed poll for this flat".** That older form was a genuine tie once a flat had two meals on one date, and Postgres broke it arbitrarily — closing breakfast could lock dinner's cart hours early, or send one meal's cart under another's name. Preserve the exact-key lookups.
- Each stage pairs `isMomentDue` (a latch) with its own already-done check, which is what makes re-running safe: `create_poll` probes for an existing poll, `close_poll` scopes its update to `status = 'open'`, `dispatch_cook` acts only on `status = 'closed'` and flips to `'dispatched'`. Grace windows differ on purpose — 24h for create/close, but only 45 min for dispatch (`DISPATCH_GRACE_MINUTES`), because a cook message arriving hours late is worse than none at all. Both create and dispatch also refuse to act past their own bound (close time, serve time respectively).
- Server-side integrity is not optional decoration: `validate_cart_dish` re-checks dietary veto and headcount on every `cart_items` write, `validate_attendance` prevents cross-household attendance rows, and `flat_meals` carries CHECK constraints mirroring the meal editor's validation (`open_offset_min <= 1440`, since the scheduler only scans today+tomorrow). Client-side filtering is for discovery only — never rely on it to enforce a constraint.
- Meal history for the 10-day no-repeat rule is derived from `cart_items` joined to `daily_polls` where `status = 'dispatched'` — `cart_items` is the cart/order-line table, not a bespoke history table, so the "no separate history table" principle still holds in spirit even though it's now a join returning a set of recipe ids per dispatched day, not a single denormalized column.

## Definition of done for MVP

A 3-person flat can: onboard, set cook phone + language, build tonight's shared cart daily with realtime updates, see a grocery checklist scaled per-dish for everything in the cart, share the missing-items list, and the cook receives a correctly translated WhatsApp message at dispatch time. Pilot metrics in `docs/07-roadmap-and-pilot.md`.

Everything above is built except the last clause: dispatch composes and translates the
message correctly and logs it, but the live BSP send is still unimplemented, so
`DISPATCH_MODE=live` records `status='failed'` and only `mock` actually works. A
flatmate can hand the prepared message to WhatsApp manually from the cook-message
screen. Automatic delivery is the single largest gap between here and the pilot —
see `docs/release-readiness.md` "Remaining before public distribution".
