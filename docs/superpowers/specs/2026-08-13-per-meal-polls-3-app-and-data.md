# Per-meal polls, part 3 — app UI and recipe curation

**Date:** 2026-08-13 · **Status:** approved (design reviewed in session) · **Scope:** Expo app (hooks + 2 screens) and the recipe dataset. Depends on parts 1 and 2.

Part 3 of 3. This is the part that makes per-meal polls visible and usable, and the part that makes breakfast suggestions actually good.

**Ordering constraint:** `use-today-cart.ts:88-93` does `.maybeSingle()` on `(flat_id, poll_date)` and **throws once a flat has two polls on one date**. So no group may be given a second meal in production until this part ships.

## Goal

Two things:
1. Surface per-meal polls in the app without adding clutter — one meal visible at a time.
2. Tag the recipe dataset so a breakfast poll suggests breakfast food.

## Meals move from AsyncStorage to the database

`app/src/lib/groups-stub.ts` is deleted. Today it stores a group's meals in device-local AsyncStorage, which means **two flatmates in the same group can disagree about which meals it covers** — there is no server-side state to reconcile. Meals now come from `flat_meals` (part 1).

Downstream:
- `use-my-groups.ts:28-46` currently does an N+1 AsyncStorage read per group to attach `meals`; that disappears into the `flats` query's join on `flat_meals`.
- `GroupSummary.meals` changes from `MealType[]` to the richer `flat_meals` rows (id, name, basis, schedule).
- `types/domain.ts`'s `MealType` union and its "UI-only for now" comment (`domain.ts:11-15`) are retired — a meal is no longer one of three fixed strings but a row with a free-text name and a fixed `basis`.

## Poll resolution — the four hooks

Four hooks resolve "today's poll" by `(flat_id, poll_date)` and all break on the second poll. Each gains a `flat_meal_id` predicate:

- `use-today-cart.ts:86-98` — the main one; also drives the realtime channel topic `cart:${pollId}`, which keeps working since it is already per-poll.
- `use-cook-dispatch.ts:32`
- `use-grocery-list.ts:27` — **except** this one goes cross-meal instead (below).
- `use-streak.ts:33` — a day is unbroken if any meal dispatched (part 2).

A new `useActiveMeal` selection sits alongside `ActiveGroupProvider` (`contexts/active-group.tsx`), defaulting to the **next upcoming meal** by serve time so the screen opens on whatever needs attention. `grocery-list`, `who-is-eating` and `cook-message-preview` scope to the same selection, mirroring how they already scope to the active group.

## Today screen — segmented switcher

`app/src/app/(tabs)/index.tsx` keeps its current single-cart layout. Above the header goes a **segmented control**, one segment per active meal, showing one meal's cart at a time.

- Defaults to the next upcoming meal.
- Each segment carries a small state dot: open / locked / dispatched — so a locked breakfast is visible without switching to it.
- With exactly one meal the switcher is hidden entirely and the screen renders as it does today.
- Segments use the meal's free-text `name`.

This deliberately reuses the pattern the group `MealChips` row already establishes, and keeps the decluttering work from the previous pass intact: one cart, one set of suggestions, one activity feed — never two stacked.

The **out-toggle becomes per-meal** (part 1 re-keyed `day_attendance`): "I'm out for this meal", scoped to the selected segment.

`meal-copy.ts`'s `*List` variants (`mealTitleList`, `mealNounList`, `mealLabelList`, `mealMomentList`, `mealShareHeadingList`) become dead code — they existed only because a multi-meal group had to merge into one header. They are deleted; the singular forms remain, driven by `basis` for time-of-day phrasing ("tonight" vs "today") and by the meal's `name` for the label.

## Settings — meal management

`app/src/app/(tabs)/settings.tsx`'s meal chip row is replaced by a **list of meal rows** inside the group card. Each row expands via the existing `CollapsibleSection` (built in the previous pass) into that meal's settings:

- Name (free text)
- Basis (three chips: breakfast / light / full) with helper text explaining it drives suggestions
- Serve time, opens-before (offset), locks at (absolute), cook messaged (offset) — reusing the existing Android time-picker `PollTimeField`
- Remove meal

Plus an "Add meal" action seeded from the defaults table in part 1.

**Group creation must create real meals.** `onboarding/create-group.tsx` currently inserts `flats` + `flat_members` only; part 1 added an after-insert trigger (`20260813000001_default_flat_meal_trigger.sql`) giving every new flat a default Dinner meal, because a flat with no meal silently never gets a poll. That trigger is the floor, not the feature — this part should let the user pick their meals during onboarding and write real `flat_meals` rows. Keep the trigger regardless: it only fires when no meal was supplied, and it protects ad-hoc and fixture-created flats.

Collapsed, each row shows a one-line summary — `"Breakfast · locks 07:00"` — consistent with the poll-times/cook summaries already in place.

Validation, surfaced inline as the existing poll-times validation is: the computed open moment must precede `close_time`, and `close_time` must precede `serve_time`. Reject offsets beyond 48h (part 2 only scans today and tomorrow).

When a group adds a third or later meal, note in the UI that the cook receives one WhatsApp message per meal per day — no cap is enforced, but the consequence should not be a surprise.

The old flat-level poll-times section is removed once every group has `flat_meals` rows; `flats.poll_open_time`/`poll_close_time`/`dispatch_time` can then be dropped in a cleanup migration.

## Grocery list — combined, one trip

`use-grocery-list.ts` merges **every locked poll in a forward 24-hour window** rather than resolving one poll (semantics specified in part 2):

- Same ingredient across meals is summed into one line.
- Each line keeps per-dish attribution ("2 for Poha, 4 for Dal").
- Staples collapse into the single "check you have: …" line, deduplicated.
- The share-to-WhatsApp text covers the whole trip, headed by the date rather than a single meal.

`grocery_checks` is keyed per poll; with a merged list, a ticked item should stay ticked across the meals it came from — tick state keys on the ingredient within the window, writing through to each contributing poll's rows.

## Recipe curation — the actual blocker

This is a prerequisite for breakfast polls being useful, not a follow-up. Verified against the live project (`pcmtsfcjzoivagpslpch`): **483 recipes, all `kind = 'main'`, plus 3 accompaniments.** No meal signal exists.

Worse, the breakfast pool is close to empty. Name-matching the CSV for breakfast dishes returns ~35 rows, but roughly 30 of them are combinatorially generated `*-bhurji` filler (`karela-bhurji`, `sarson-bhurji`, `lauki-bhurji`, `fish-bhurji`) rather than dishes anyone eats for breakfast. Genuinely usable today: **about six** — dosa ×2, poha, uppittu, besan-chilla, masala-omelette.

Three tasks:

1. **Bulk-tag existing recipes.** Set `suitable_bases` by `base` — the 44 rice / 31 mutton / 30 fish / 24 sabzi rows are `{full}`, lighter items get `{light,full}`. Done as SQL against the live project (the seed script needs a service-role key not available in this environment; CLAUDE.md notes data has been inserted via `db query` directly).
2. **Curate a real breakfast set.** Genuinely absent and needed: idli, upma, paratha (aloo/gobi/paneer), sabudana khichdi, uttapam, medu vada, pongal, thepla, egg sandwich, besan cheela variants. Target ~25-30 dishes so the basis-scoped 10-day no-repeat rule (part 2) has room to rotate without exhausting the pool.
3. **Fix the accompaniment data gap.** `data/recipe-accompaniments.csv` references `roti`, `steamed-rice`, `jeera-rice` — **none of which exist in `recipes.csv`**, so the seeder's unknown-slug guard (`supabase/seed/seed-recipes.ts:132-137`) skips every mapping row. Add the missing accompaniment recipes so `poll_accompaniment_options` stops coming back empty on a fresh seed.

Recipe instruction text stays imperative plain English written for the cook; translation happens at dispatch, never stored pre-translated (repo convention).

## Verification

- `npx tsc --noEmit` and `npx expo lint` from `/app`.
- Run the app (`npx expo start`) against a test group with breakfast + dinner and confirm:
  - The switcher shows both meals, defaults to the next upcoming one, and hides itself for a single-meal group.
  - Switching segments swaps cart, suggestions, activity feed and out-toggle together.
  - Marking out for breakfast leaves the dinner headcount unchanged (per-meal attendance).
  - Breakfast suggests breakfast food and dinner does not (the tagging actually took effect).
  - The grocery list covers both meals in one list with summed quantities and correct per-dish attribution.
  - Editing a meal's schedule in Settings persists and the summary line updates.
  - Validation rejects a `close_time` after `serve_time`.
- Regression: a single-meal (dinner) group must look and behave exactly as before this three-part change.
- End-to-end: with a two-meal group, let the real pg_cron pipeline run a full day and confirm two polls, two locks, two cook messages (mock mode, `dispatch_log`), and one combined grocery list.
