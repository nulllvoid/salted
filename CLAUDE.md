# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Read this before doing anything. Then read `docs/02-prd.md` and `docs/03-mvp-spec.md`.

## Repo status

Wired to a real Supabase project (`pcmtsfcjzoivagpslpch`) — not a local/mock setup. `/app` queries Supabase directly (auth, the shared cart, grocery list, settings all live). `/supabase`'s `create_poll`, `close_poll`, and `dispatch_cook` Edge Functions are fully implemented (dietary veto, 10-day exclusion, variety heuristic, per-dish ingredient scaling, translation cache with graceful fallback) and deployed; `dispatch_cook`'s live BSP send is still unimplemented (mock mode only — no BSP account provisioned yet). pg_cron + pg_net are enabled and scheduled to invoke all three functions every 15 minutes (`supabase/migrations/20260108000003_pg_cron.sql`); each function self-selects which **meals** are due by comparing `flat_meals` wall-clock times against current IST. The scheduling unit is a row in `flat_meals`, not a flat: a flat serving breakfast and dinner gets two independent polls a day. A meal's poll can open on the day *before* it is served, so open/dispatch moments are computed backwards from `serve_time` (`supabase/functions/_shared/ist-time.ts`). All three stages **latch** on "due yet and not yet done" rather than "due in this exact 15-minute tick", so a tick lost to a failed cron run or an edited poll time is recovered on the next one instead of dropped for the day.

Dinner selection is a **shared, multi-item cart**, not a single-winner vote: `create_poll` seeds up to 3 main-course suggestions plus up to 3 accompaniment suggestions each day; any flatmate can tap a suggestion to add it to `cart_items` (one row per poll+recipe, not per-user) at a quantity defaulting to headcount, and any flatmate can edit any line's quantity or remove it while the poll is `open`. `close_poll` just locks the cart (flips status, enforced via RLS) — there is no winner, tie-break, or vote tally anywhere in the pipeline anymore. `dispatch_cook` composes one message covering every cart line, each dish scaled by its own cart quantity.

```
/app          Expo app (Expo Router, TypeScript) — see app/CLAUDE.md
/supabase     migrations/ (from docs/05-schema.sql + RLS + pg_cron), functions/ (create_poll, close_poll, dispatch_cook implemented; wa_webhook still a stub), seed/ (CSV loader)
/data         recipe + ingredient CSVs (source of truth for seeding)
/docs         product/architecture docs
```

### Commands (run from `/app`)

- `npm install` — install deps
- `npx expo start` — dev server (press `a` for Android emulator, `w` for web)
- `npx tsc --noEmit` — typecheck
- `npx expo lint` — lint
- Copy `app/.env.example` to `app/.env` and fill in `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` before the app can reach a real Supabase project. `src/lib/supabase.ts` throws at import time if these are missing.
- `npm run test:unit` — pure unit tests over the Edge Functions' shared logic (`app/e2e/unit/`), run through Playwright with no browser or dev server. Deno is not installed in this environment, so this is how `supabase/functions/**` gets tested; specs import the function `.ts` modules directly.
- `npm run test:e2e` — Playwright browser tests against the live project (boots Expo on 8081; much slower).

### Supabase (linked to the live project — most work happens against it directly, not local)

- Project ref `pcmtsfcjzoivagpslpch`. The Supabase CLI (`npx supabase`) works against it without extra login in this environment.
- `npx supabase db push` applies new migrations from `supabase/migrations/`. `npx supabase db query --linked "<sql>"` (or `--file <path>` for multi-line SQL) runs ad-hoc queries directly — the practical way to inspect/seed data without a service-role key on hand.
- `npx supabase functions deploy <name> --project-ref pcmtsfcjzoivagpslpch` deploys a single Edge Function; all three (`create_poll`, `close_poll`, `dispatch_cook`) have `verify_jwt = false` (see `supabase/config.toml`), so they can be curled directly with no auth header for manual testing.
- Seed script: `npx tsx supabase/seed/seed-recipes.ts` (needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` env vars — not available in this dev environment; new recipe/seed data has instead been inserted via `db query` SQL directly against the live project when needed).
- Local Supabase (`supabase start`) is not used in this workflow — `supabase/config.toml` exists but development happens against the live project.

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
- Keep the app to 4 screens (Flat setup / Today's cart / Grocery checklist / Settings). Push back on screen sprawl.
- RLS on every flat-scoped table: members can read/write only their own flat (`flat_id` match). `recipes`/`recipe_ingredients`/`recipe_translations` are global read-only to authenticated users; writes are service-role only.
- Poll creation is deterministic and idempotent: option selection is seeded by `(flat_id, date)`, and `daily_polls` upserts on `unique (flat_id, poll_date)` — re-running `create_poll` for a flat/day must not change or duplicate results.
- Meal history for the 10-day no-repeat rule is derived from `cart_items` joined to `daily_polls` where `status = 'dispatched'` — `cart_items` is the cart/order-line table, not a bespoke history table, so the "no separate history table" principle still holds in spirit even though it's now a join returning a set of recipe ids per dispatched day, not a single denormalized column.

## Definition of done for MVP

A 3-person flat can: onboard, set cook phone + language, build tonight's shared cart daily with realtime updates, see a grocery checklist scaled per-dish for everything in the cart, share the missing-items list, and the cook receives a correctly translated WhatsApp message at dispatch time. Pilot metrics in `docs/07-roadmap-and-pilot.md`.
