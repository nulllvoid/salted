# Per-meal polls, part 2 — the daily pipeline

**Date:** 2026-08-13 · **Status:** approved (design reviewed in session) · **Scope:** the three Edge Functions and their shared helpers. Depends on part 1 (schema). No app changes.

Part 2 of 3. Part 1 is the schema migration, part 3 is the app UI and recipe curation.

## Goal

Cut the pipeline over from *"one poll per flat per day, scheduled by three columns on `flats`"* to *"one poll per `flat_meals` row per day, scheduled by that row"*.

The functions currently fetch **all** flats and filter in TypeScript against IST wall-clock (`supabase/functions/_shared/ist-time.ts`). That shape is kept — it works and pg_cron stays a dumb 15-minute heartbeat — but the iteration unit becomes `flat_meals` instead of `flats`.

**pg_cron needs no changes.** `supabase/migrations/20260108000003_pg_cron.sql` invokes all three functions every 15 minutes unconditionally; the functions self-select what is due. The 15-minute `isWithinCronWindow` window must stay matched to that cron interval.

## The scheduling primitive

Everything hinges on one helper, added to `_shared/ist-time.ts`: given a `flat_meals` row and the current IST moment, decide whether a given event (open / dispatch) for a given **serving date** falls in this tick.

```ts
// Serving date is the anchor. The open moment can land on a previous
// calendar day, which is the whole point of open_offset_min.
export function eventMomentIst(serveDate: string, serveTime: string, offsetMin: number): Date
```

`create_poll` and `dispatch_cook` must therefore test **candidate serving dates**, not just today: a meal served tomorrow can have its open moment today. Checking today and tomorrow covers any `open_offset_min` up to 48h, which bounds the loop; offsets beyond that are rejected at write time in part 3.

`close_poll` is simpler — `close_time` is an absolute wall-clock time on the serving date, so it only ever tests today.

## `create_poll`

Current shape (`supabase/functions/create_poll/index.ts:22-31`): select `flats(id, poll_open_time)`, keep those where `isWithinCronWindow(poll_open_time, nowIst)`.

New shape: select active `flat_meals` joined to their flat. For each row, for each candidate serving date (today, tomorrow), compute the open moment and test the window. A hit means "create the poll for that serving date".

Three further changes inside the function:

**Idempotency probe** (`index.ts:48-57`) — currently `.maybeSingle()` on `(flat_id, poll_date)`, which *throws* the moment a second poll exists for that date. Must include `flat_meal_id`, matching the new unique constraint from part 1.

**Suggestion seed** (`_shared/select-options.ts:92`) — currently `seededRng(\`${flatId}:${pollDate}\`)`. Two meals on one day would otherwise get byte-identical suggestion lists. Becomes `${flatId}:${pollDate}:${flatMealId}`, following the pattern already used for the accompaniment shuffle at `select-options.ts:133`.

**Candidate pool and the 10-day rule** — the pool is currently hardcoded to `.eq('kind','main')` with no meal filter (`index.ts:66-70`); it gains `suitable_bases @> [basis]`. The 10-day no-repeat exclusion (`index.ts:73-83`) is currently scoped to the whole flat, which under per-meal polls would let Monday's poha suppress it across the next ten *breakfasts* while dinner is unaffected. It must be **scoped per basis**: exclude recipes dispatched in the last 10 days *for polls of meals sharing this basis*. With a small breakfast pool an unscoped rule would exhaust the pool within days.

Keep the accompaniment/side seeding behavior, but let `basis` govern it: a `breakfast` or `light` meal seeds mains only (no accompaniment/side round), since roti-and-rice pairing is a `full`-meal concept.

## `close_poll`

Current shape (`index.ts:38-48`) is the most clearly broken one under per-meal polls:

```ts
.eq('flat_id', flatId).eq('status','open')
.order('poll_date', { ascending: false }).limit(1).maybeSingle()
```

With breakfast and dinner both `open` on the same date, ordering by `poll_date` is a **tie** and Postgres picks arbitrarily — closing the wrong meal's cart. Replace with an explicit per-meal lookup: iterate active `flat_meals` whose `close_time` is in this tick, and close the poll matching `(flat_id, poll_date = today, flat_meal_id)`.

The cancel-when-everyone-is-out branch (`index.ts:50-65`) currently counts `day_attendance` by `poll_date` alone. It now filters on `flat_meal_id` too, so being out for breakfast does not cancel dinner.

## `dispatch_cook`

Same ambiguity and the same fix as `close_poll` (`index.ts:74-84`): resolve the poll by `flat_meal_id` rather than "latest closed poll for this flat". Due-check uses `dispatch_offset_min` before `serve_time`, tested against today and tomorrow's serving dates.

**The message must name the meal.** Today it is meal-neutral (`index.ts:275-283`): `` `Today's meal: ${dishSummary}` ``. With multiple meals a day this is actively confusing — the cook receives two messages that both say "today's meal". It becomes the meal's own name plus its timing, e.g. `"Breakfast tomorrow (8:00am): Poha ×3"`, translated as before. The meal name is free text (part 1), so it flows through the existing translation path unchanged; the *label* is translated, the user's custom name is passed through as-is.

The flat still has exactly one active cook (`one_active_cook_per_flat`, `docs/05-schema.sql:50`) — unchanged. With unlimited meals allowed per group, that cook receives one message per active meal per day. That is the accepted trade-off; no cap is enforced, but it is worth surfacing in the part 3 settings UI when a group adds a third or later meal.

Cart bucketing by `kind` (`index.ts:114-118`) is unchanged.

## Grocery list — cross-meal, one shopping trip

This is the one behavior that deliberately does **not** follow the per-poll split, because shopping is a single physical trip. The grocery query stops resolving one poll and instead merges **every locked poll in a forward 24-hour window** for the group:

- Same ingredient across meals is **summed**, not listed twice (buy 12 eggs once, not 6 + 6).
- Each line keeps per-dish attribution so the checklist still explains what each quantity is for.
- Staples (`is_staple = true`) stay collapsed into the single "check you have: …" line, deduplicated across meals.

The query lives in the app (`app/src/hooks/use-grocery-list.ts`) and is specified here because it is a pipeline-semantics decision; the implementation lands in part 3.

## Streak

`use-streak.ts:33` walks backward by date assuming one poll per day. A day counts as unbroken if **any** meal dispatched — this preserves exactly today's behavior for single-meal groups and avoids punishing a group for skipping breakfast.

## Verification

All three functions have `verify_jwt = false` (`supabase/config.toml`), so they can be curled directly with no auth header.

- Seed a test flat with two meals: breakfast (opens previous evening, locks 07:00) and dinner (opens 09:00, locks 16:00).
- **create_poll**: invoke at a simulated tick matching breakfast's open moment; confirm exactly one poll row appears with `poll_date` = *tomorrow* and the breakfast `flat_meal_id`. Re-invoke the same tick and confirm no duplicate (idempotency through the new constraint). Confirm breakfast and dinner polls on the same date have **different** suggestion sets (the seed fix).
- **close_poll**: with both polls `open` on one date, invoke at breakfast's `close_time` and confirm *only* the breakfast poll flips to `closed` — this is the arbitrary-tie-break bug, so assert the dinner poll is untouched.
- **dispatch_cook**: confirm one message per meal, each naming its meal, with `DISPATCH_MODE=mock` writing payloads to `dispatch_log` without calling the BSP.
- Confirm the 10-day exclusion is basis-scoped: dispatch a breakfast dish, then confirm it is excluded from subsequent breakfast polls but *not* from dinner polls.
- Regression: a flat with exactly one (dinner) meal must behave identically to before the change — same open/close/dispatch times, same suggestions, same message text apart from the meal name.
