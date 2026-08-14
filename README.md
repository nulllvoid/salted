# Salted

A low-friction meal-planning app for shared households (flatmates) in Indian metros that employ a daily domestic cook.

**Core loop:** curated daily meal vote → auto-scaled grocery list → vernacular WhatsApp instructions to the cook.

## Repo map

| Path | Purpose |
|---|---|
| `CLAUDE.md` | Context + conventions for AI agents working in this repo |
| `docs/01-research-original.md` | Founder's original strategic research (full vision, long-term) |
| `docs/02-prd.md` | Product requirements — problem, personas, MVP scope, out-of-scope |
| `docs/03-mvp-spec.md` | Screen-by-screen MVP spec, flows, edge cases |
| `docs/04-architecture.md` | Tech stack, system design, integration notes |
| `docs/05-schema.sql` | Supabase/Postgres schema (source of truth for data model) |
| `docs/06-whatsapp-integration.md` | BSP setup, message templates (Hindi/Kannada), dispatch flow |
| `docs/07-roadmap-and-pilot.md` | 4-week build plan, pilot success metrics |
| `data/generate_dataset.py` | Source of truth for the recipe dataset — edit here, regenerate the CSVs below |
| `data/recipes.csv`, `data/ingredients.csv`, `data/ingredient-glossary.csv` | Generated recipe/ingredient/translation data (48 dishes) |
| `data/recipe-accompaniments-template.csv` | Curated main-dish → accompaniment (roti/rice) mapping |
| `app/` | Expo (React Native + TypeScript) app — Expo Router, 4 MVP screens wired to live Supabase |
| `app/e2e/` | Multi-user Playwright suite, runs against the live Supabase project |
| `supabase/` | Postgres migrations (from `docs/05-schema.sql`) + RLS + pg_cron, Edge Functions (`create_poll`/`close_poll`/`dispatch_cook` implemented, `wa_webhook` a stub), CSV seed script |

## Status

Wired to a real Supabase project (`pcmtsfcjzoivagpslpch`) — auth, votes, grocery list, and settings all live. `create_poll`, `close_poll`, and `dispatch_cook` are implemented and scheduled via pg_cron every 15 minutes; `dispatch_cook`'s live WhatsApp send is still mock-only pending a BSP account. See `CLAUDE.md`'s "Repo status" for the current, maintained picture — this file's "Status" section lags behind by nature and should not be trusted over that one.

## Golden rules

1. MVP scope is defined in `docs/02-prd.md` §4. Anything not listed there is **out of scope** — do not build it, however tempting (no digital pantry, no Q-comm cart APIs, no ML recommender, no expense ledger in v1).
2. `docs/05-schema.sql` is the single source of truth for the data model. Update it first, then code.
3. The recipe/ingredient dataset is a first-class product asset. Quantities must be buyable by non-cooks ("2 medium onions", "200g paneer"), never "1 katori" or "to taste".
4. Longest-lead-time item is WhatsApp/Meta template approval — never block on it; build with a mock dispatcher until approved.
