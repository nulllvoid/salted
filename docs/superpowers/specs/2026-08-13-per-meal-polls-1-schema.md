# Per-meal polls, part 1 — schema and migration

**Date:** 2026-08-13 · **Status:** shipped 2026-08-13 · **Scope:** the schema migration, plus the minimum writer changes the new NOT NULL columns force.

Part 1 of 3. Part 2 is the daily pipeline (Edge Functions), part 3 is the app UI and recipe curation.

> **Correction (found during implementation).** This spec originally claimed part 1 was "database only — no Edge Function or app changes". That was wrong. `daily_polls.flat_meal_id` and `day_attendance.flat_meal_id` are `NOT NULL`, so every writer breaks the moment the migration lands:
> - `create_poll` inserted without `flat_meal_id` and failed on **every run** until fixed — verified against the live project via `pipeline_errors`.
> - `use-today-cart.ts`'s out-toggle and `use-attendance.ts`'s `setMemberOut` upserted `day_attendance` without it.
>
> Each was changed to resolve the flat's **first active meal**, which the backfill guarantees exists. That preserves exactly one poll per flat per day, so the *behavior* claim holds — but it is not achieved by leaving the code alone. A NOT NULL column added to a table with live writers is never a schema-only change.

## Goal

Give a group **one poll per meal per day** instead of one poll per day, and make a group's meals real database rows.

Today `meals` is a device-local AsyncStorage array (`app/src/lib/groups-stub.ts`) that the backend has never seen — `meal`/`meal_type` appears in zero SQL files. A group labeled "breakfast + dinner" therefore still gets exactly one poll, one cart and one cook message per day, which is the bug being fixed. `app/src/types/domain.ts:11-15` states the current invariant outright: *"the backend pipeline has no meal dimension at all, exactly one cart/poll/dispatch per group per day regardless of which meals it's labeled with."*

The scheduling model is anchored on the fact that **the close time is the real deadline** — it is what gates the grocery run and the market visit — and that a meal's poll may need to open the *previous day* (breakfast Tuesday should be decidable Monday evening, so groceries can be bought Monday night or Tuesday morning).

## Concept model

A **meal** is a recurring slot a group runs (breakfast, dinner, "Post-gym meal"). It carries its own name, its own schedule, and its own suggestion basis. Every meal produces its own poll → cart → grocery contribution → cook message.

Two properties are deliberately separated:

- **`name`** — free text, user-facing. Groups can name a meal anything ("Brunch", "Post-gym meal").
- **`basis`** — a fixed, closed set that drives *which recipes get suggested*. Free-text names cannot drive suggestions, because the recipe dataset has to be tagged against something stable. This is the resolution of the "custom names vs. recipe tagging" tension: name freely, suggest reliably.

`basis` values: `'breakfast' | 'light' | 'full'`.
- `breakfast` — poha, idli, upma, paratha, chilla, omelette.
- `light` — a smaller mid-day/evening meal; one main, minimal sides.
- `full` — the current default behavior: main(s) + accompaniments + sides.

## Schedule model

Every time is derived from **`serve_time`**, the moment the meal is eaten, which is the natural anchor and the only field a user reliably knows. The poll's `poll_date` is the meal's **serving date**, always — this is what removes midnight-crossing special cases.

| Column | Meaning |
|---|---|
| `serve_time time` | when the meal is eaten |
| `open_offset_min int` | minutes **before** `serve_time` that the poll opens; may exceed 1440, which is how a poll opens on a previous day |
| `close_time time` | wall-clock deadline on the serving date — the cart locks here (the field that matters most; kept as an absolute time, not an offset, because users think about it as "locked by 7am") |
| `dispatch_offset_min int` | minutes before `serve_time` that the cook is messaged |

Breakfast served 08:00 with `open_offset_min = 840` (14h) opens at 18:00 the previous evening, locks at `close_time = 07:00` on the serving date, and dispatches at `dispatch_offset_min = 90` → 06:30.

Defaults (chosen so a grocery run is possible before the market visit):

| Meal | basis | serve_time | open_offset_min | close_time | dispatch_offset_min |
|---|---|---|---|---|---|
| Breakfast | `breakfast` | 08:00 | 840 (18:00 prev day) | 07:00 | 90 (06:30) |
| Lunch | `light` | 13:00 | 300 (08:00) | 11:00 | 90 (11:30) |
| Dinner | `full` | 20:30 | 690 (09:00) | 16:00 | 270 (16:00) |

`close_time` must fall between the computed open moment and `serve_time`; enforced in the app (part 3) and by a check where expressible.

## Schema changes

Edit `docs/05-schema.sql` first (repo convention: schema doc is source of truth, then generate the migration), then add `supabase/migrations/20260813000000_per_meal_polls.sql`.

### New table `flat_meals`

```sql
create table flat_meals (
  id uuid primary key default gen_random_uuid(),
  flat_id uuid not null references flats(id) on delete cascade,
  name text not null,                          -- free, user-facing: 'Breakfast', 'Post-gym meal'
  basis text not null default 'full' check (basis in ('breakfast','light','full')),
  serve_time time not null,
  open_offset_min int not null check (open_offset_min > 0),   -- may exceed 1440: opens a previous day
  close_time time not null,
  dispatch_offset_min int not null check (dispatch_offset_min >= 0),
  position int not null default 0,             -- ordering in the UI switcher
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index flat_meals_flat on flat_meals(flat_id) where is_active;
```

No cap on meals per group (explicitly chosen). Practical caution to carry into part 2: each active meal is one more WhatsApp message per day to the flat's single cook.

### `daily_polls` — key by meal

```sql
alter table daily_polls add column flat_meal_id uuid references flat_meals(id) on delete cascade;
-- backfill (below), then:
alter table daily_polls alter column flat_meal_id set not null;
alter table daily_polls drop constraint daily_polls_flat_id_poll_date_key;
alter table daily_polls add constraint daily_polls_flat_date_meal_key
  unique (flat_id, poll_date, flat_meal_id);
```

`poll_date` remains the **serving** date. The unique constraint keeps doing double duty as the `create_poll` idempotency guard, now at meal granularity.

### `day_attendance` — per-meal attendance

Approved: you can be out for breakfast but in for dinner. Headcount drives cart quantities and the cook's message, so this is a correctness issue, not a nicety.

```sql
alter table day_attendance add column flat_meal_id uuid references flat_meals(id) on delete cascade;
-- backfill, then swap the PK:
alter table day_attendance drop constraint day_attendance_pkey;
alter table day_attendance add primary key (flat_id, user_id, poll_date, flat_meal_id);
```

### `recipes` — meal suitability

```sql
alter table recipes add column suitable_bases text[] not null default '{full}';
create index recipes_suitable_bases on recipes using gin(suitable_bases);
```

Tagging the dataset is part 3 (it is a curation task, not a migration). The `'{full}'` default preserves today's behavior for all 483 existing rows.

### Unchanged — and why that matters

`cart_items`, `poll_options`, `poll_accompaniment_options`, `activity_log`, `grocery_checks`, `dispatch_log`, `meal_feedback` are all keyed purely on `poll_id`, so they need **no changes**: each meal gets its own poll row, and everything hanging off a poll follows automatically.

RLS likewise needs no rewrite. The cart lock policy in `supabase/migrations/20260109000000_cart_items.sql:46-53` resolves flat membership and `status = 'open'` through `poll_id`, so each meal now locks independently for free. Same for the `take_fallback_cart_item` RPC (`20260109000002_take_fallback_rpc.sql:29-50`).

New RLS needed only for `flat_meals`: members read/write their own flat's rows, matching the existing `is_flat_member(flat_id)` pattern used throughout `20260101000001_rls.sql`.

## Migration and backfill

Every existing group becomes a single dinner meal carrying its current schedule, so behavior is identical after migration:

```sql
insert into flat_meals (flat_id, name, basis, serve_time, open_offset_min, close_time, dispatch_offset_min, position)
select id, 'Dinner', 'full', '20:30',
       -- preserve each flat's existing open time as an offset from serve_time
       extract(epoch from ('20:30'::time - poll_open_time)) / 60,
       poll_close_time,
       extract(epoch from ('20:30'::time - dispatch_time)) / 60,
       0
from flats;

update daily_polls p set flat_meal_id = m.id
  from flat_meals m where m.flat_id = p.flat_id;

update day_attendance a set flat_meal_id = m.id
  from flat_meals m where m.flat_id = a.flat_id;
```

Guard: any flat whose `poll_open_time` is later than 20:30 would produce a negative offset. Clamp to a sane minimum in the backfill and log it; with the shipped defaults (09:00) this does not occur, but the migration should not silently write a violating row.

**`flats.poll_open_time` / `poll_close_time` / `dispatch_time` are kept, not dropped.** Part 2 still reads them until the pipeline is cut over; they are removed in a later cleanup migration once nothing references them. This is what makes part 1 independently shippable.

## Verification

- `npx supabase db push`, then confirm via `npx supabase db query --linked`:
  - `select count(*) from flat_meals;` equals the number of flats.
  - `select count(*) from daily_polls where flat_meal_id is null;` returns 0.
  - `select count(*) from day_attendance where flat_meal_id is null;` returns 0.
  - Every `flat_meals` row's derived open moment is before its `close_time`, and `close_time` before `serve_time`.
- Insert a second `flat_meals` row for a test flat and confirm two same-date `daily_polls` rows can coexist (the constraint swap actually took effect).
- Confirm the existing app still loads: `use-today-cart.ts` does `.maybeSingle()` on `(flat_id, poll_date)` and **will throw once a flat has two polls on one date** — so during part 1, test flats must keep exactly one meal. This is the first thing part 3 fixes, and is the reason part 3 must land before any group is given a second meal in production.
- Run the three Edge Functions manually (`verify_jwt = false`, curl directly) and confirm they still create/close/dispatch correctly against the migrated schema. **`create_poll` needs its `flat_meal_id` fix deployed first** (see the correction above) — otherwise it fails silently on every run, logging to `pipeline_errors` while still reporting `failures: 0` at the HTTP layer, because the per-flat error is swallowed. Check `pipeline_errors`, not the response body, when verifying this function.
