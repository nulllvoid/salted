# Per-meal polls, part 1 (schema) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a group one poll per meal per day by making meals real database rows, without changing any Edge Function or app behavior.

**Architecture:** A new `flat_meals` table holds one row per meal a group runs (free-text name + fixed suggestion `basis` + schedule anchored on `serve_time`). `daily_polls` and `day_attendance` gain `flat_meal_id`; `recipes` gains `suitable_bases`. Every existing flat is backfilled to a single "Dinner" meal carrying its current schedule, so the running pipeline and app behave identically after migration. `flats.poll_open_time`/`poll_close_time`/`dispatch_time` are deliberately **kept** — part 2 still reads them.

**Tech Stack:** Postgres (Supabase, project ref `pcmtsfcjzoivagpslpch`), Supabase CLI migrations, Playwright e2e against the live DB.

**Spec:** `docs/superpowers/specs/2026-08-13-per-meal-polls-1-schema.md`

## Global Constraints

- **Schema convention:** edit `docs/05-schema.sql` FIRST, then write the migration to match. It is the source of truth (`CLAUDE.md`).
- **Migration naming:** `supabase/migrations/YYYYMMDDHHMMSS_name.sql`. Next in sequence: `20260813000000_per_meal_polls.sql`.
- **Apply with:** `npx supabase db push`. Inspect with `npx supabase db query --linked "<sql>"` (or `--file <path>`).
- **All times are IST** (`Asia/Kolkata`).
- **RLS on every flat-scoped table.** Follow the `cooks` pattern in `supabase/migrations/20260101000001_rls.sql:70-77`: `for select using (is_flat_member(flat_id))` plus `for all using (...) with check (...)`.
- **`basis` is a closed set:** `'breakfast' | 'light' | 'full'`. The meal `name` is free text.
- **Do NOT drop** `flats.poll_open_time`, `flats.poll_close_time`, `flats.dispatch_time` in this part.
- **Verification is the e2e suite**, not unit tests — there is no unit test runner. `cd app && npm run test:e2e` (needs a dev server on :8081 and `SUPA_JWT` in `app/.env`).

## Default meal schedules

Used by the backfill and by part 3's "Add meal" defaults. Offsets are minutes before `serve_time`; all six values are arithmetically verified.

| Meal | basis | serve_time | open_offset_min | close_time | dispatch_offset_min |
|---|---|---|---|---|---|
| Breakfast | `breakfast` | 08:00 | 840 (→ 18:00 prev day) | 07:00 | 90 (→ 06:30) |
| Lunch | `light` | 13:00 | 300 (→ 08:00) | 11:00 | 90 (→ 11:30) |
| Dinner | `full` | 20:30 | 690 (→ 09:00) | 16:00 | 270 (→ 16:00) |

---

### Task 1: Schema doc + migration for `flat_meals`, poll/attendance keys, and recipe bases

**Files:**
- Modify: `docs/05-schema.sql` (daily_polls block at :106-114, day_attendance at :154-161, recipes at :54-69)
- Create: `supabase/migrations/20260813000000_per_meal_polls.sql`

**Interfaces:**
- Produces: table `flat_meals(id, flat_id, name, basis, serve_time, open_offset_min, close_time, dispatch_offset_min, position, is_active, created_at)`; column `daily_polls.flat_meal_id uuid not null`; constraint `daily_polls_flat_date_meal_key unique (flat_id, poll_date, flat_meal_id)`; column `day_attendance.flat_meal_id uuid not null` as part of its PK; column `recipes.suitable_bases text[] not null default '{full}'`.

- [ ] **Step 1: Update `docs/05-schema.sql` — add `flat_meals` above the "daily loop" section**

Insert immediately before the `-- ============ daily loop ============` comment (currently line 104):

```sql
-- ============ meals a group runs ============

-- One row per meal a group runs each day. `name` is free user-facing text
-- ('Brunch', 'Post-gym meal'); `basis` is the closed set that actually
-- drives recipe suggestions, so a custom name never degrades suggestion
-- quality. Schedule is anchored on serve_time: open_offset_min may exceed
-- 1440, which is how a breakfast poll opens the previous evening, while
-- close_time stays an absolute wall-clock time on the serving date because
-- the lock is the deadline users actually think about ("locked by 7am").
create table flat_meals (
  id uuid primary key default gen_random_uuid(),
  flat_id uuid not null references flats(id) on delete cascade,
  name text not null,
  basis text not null default 'full' check (basis in ('breakfast','light','full')),
  serve_time time not null,
  open_offset_min int not null check (open_offset_min > 0),
  close_time time not null,
  dispatch_offset_min int not null check (dispatch_offset_min >= 0),
  position int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index flat_meals_flat on flat_meals(flat_id) where is_active;
```

- [ ] **Step 2: Update `docs/05-schema.sql` — re-key `daily_polls`**

Replace the `daily_polls` table (lines 106-114) with:

```sql
create table daily_polls (
  id uuid primary key default gen_random_uuid(),
  flat_id uuid not null references flats(id) on delete cascade,
  flat_meal_id uuid not null references flat_meals(id) on delete cascade,
  poll_date date not null,                    -- the SERVING date, even when the poll opened a day earlier
  status text not null default 'open' check (status in ('open','closed','cancelled','dispatched')),
  flat_note text,                             -- 'less spicy today' — editable until dispatch
  created_at timestamptz not null default now(),
  unique (flat_id, poll_date, flat_meal_id)   -- idempotent creation, per meal
);
```

- [ ] **Step 3: Update `docs/05-schema.sql` — re-key `day_attendance` and tag `recipes`**

Replace `day_attendance`'s primary key line (currently `primary key (flat_id, user_id, poll_date)` at :160) so the table reads:

```sql
create table day_attendance (                 -- "I'm out for this meal"
  flat_id uuid not null references flats(id) on delete cascade,
  flat_meal_id uuid not null references flat_meals(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  poll_date date not null,
  is_out boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (flat_id, user_id, poll_date, flat_meal_id)
);
```

In the `recipes` table (:54-69), add after the `seasons` column:

```sql
  suitable_bases text[] not null default '{full}',  -- which flat_meals.basis values this dish suits
```

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/20260813000000_per_meal_polls.sql`:

```sql
-- Per-meal polls, part 1: meals become real rows and polls key per meal.
-- See docs/superpowers/specs/2026-08-13-per-meal-polls-1-schema.md
--
-- flats.poll_open_time / poll_close_time / dispatch_time are deliberately
-- KEPT here: part 2 (the Edge Functions) still reads them. They come out in
-- a later cleanup migration once nothing references them.

create table flat_meals (
  id uuid primary key default gen_random_uuid(),
  flat_id uuid not null references flats(id) on delete cascade,
  name text not null,
  basis text not null default 'full' check (basis in ('breakfast','light','full')),
  serve_time time not null,
  open_offset_min int not null check (open_offset_min > 0),
  close_time time not null,
  dispatch_offset_min int not null check (dispatch_offset_min >= 0),
  position int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index flat_meals_flat on flat_meals(flat_id) where is_active;

alter table flat_meals enable row level security;

create policy "flat_meals: members read" on flat_meals
  for select using (is_flat_member(flat_id));

create policy "flat_meals: members write" on flat_meals
  for all using (is_flat_member(flat_id)) with check (is_flat_member(flat_id));

-- Backfill: every existing flat becomes one Dinner meal carrying its own
-- current schedule, so behavior is identical after this migration.
-- greatest(...) guards a flat whose poll_open_time/dispatch_time is later
-- than the 20:30 serve anchor, which would otherwise write a
-- check-constraint-violating (negative) offset.
insert into flat_meals (flat_id, name, basis, serve_time, open_offset_min, close_time, dispatch_offset_min, position)
select
  id,
  'Dinner',
  'full',
  '20:30'::time,
  greatest(1, (extract(epoch from ('20:30'::time - poll_open_time)) / 60)::int),
  poll_close_time,
  greatest(0, (extract(epoch from ('20:30'::time - dispatch_time)) / 60)::int),
  0
from flats;

-- daily_polls: add the meal key, backfill, then enforce.
alter table daily_polls add column flat_meal_id uuid references flat_meals(id) on delete cascade;

update daily_polls p set flat_meal_id = m.id
from flat_meals m where m.flat_id = p.flat_id;

alter table daily_polls alter column flat_meal_id set not null;
alter table daily_polls drop constraint daily_polls_flat_id_poll_date_key;
alter table daily_polls add constraint daily_polls_flat_date_meal_key
  unique (flat_id, poll_date, flat_meal_id);

-- day_attendance: same treatment, then swap the PK.
alter table day_attendance add column flat_meal_id uuid references flat_meals(id) on delete cascade;

update day_attendance a set flat_meal_id = m.id
from flat_meals m where m.flat_id = a.flat_id;

alter table day_attendance alter column flat_meal_id set not null;
alter table day_attendance drop constraint day_attendance_pkey;
alter table day_attendance add primary key (flat_id, user_id, poll_date, flat_meal_id);

-- Recipe meal suitability. Default '{full}' preserves today's behavior for
-- all existing rows; real tagging is a curation task in part 3.
alter table recipes add column suitable_bases text[] not null default '{full}';
create index recipes_suitable_bases on recipes using gin(suitable_bases);
```

- [ ] **Step 5: Verify the constraint name before applying**

The migration drops `daily_polls_flat_id_poll_date_key` and `day_attendance_pkey` by name. Postgres' auto-generated names are predictable but confirm them first — a wrong name fails the whole migration.

Run:
```bash
npx supabase db query --linked "select conname, conrelid::regclass from pg_constraint where conrelid in ('daily_polls'::regclass, 'day_attendance'::regclass) and contype in ('u','p');"
```
Expected: `daily_polls_flat_id_poll_date_key` (unique) and `day_attendance_pkey` (primary). If either differs, correct the migration to the actual name.

- [ ] **Step 6: Apply the migration**

Run: `npx supabase db push`
Expected: applies cleanly, no errors.

- [ ] **Step 7: Verify the migration did what it claims**

Run each and confirm the expected result:

```bash
# one meal per flat, all named Dinner
npx supabase db query --linked "select (select count(*) from flat_meals) as meals, (select count(*) from flats) as flats;"
# -> meals == flats

# no orphaned rows
npx supabase db query --linked "select (select count(*) from daily_polls where flat_meal_id is null) as polls, (select count(*) from day_attendance where flat_meal_id is null) as attendance;"
# -> both 0

# backfilled offsets are sane: open before close before serve
npx supabase db query --linked "select count(*) from flat_meals where close_time >= serve_time or open_offset_min <= 0;"
# -> 0

# the new constraint actually replaced the old one
npx supabase db query --linked "select conname from pg_constraint where conrelid = 'daily_polls'::regclass and contype = 'u';"
# -> daily_polls_flat_date_meal_key only
```

- [ ] **Step 8: Prove two polls can now coexist on one date**

This is the whole point of the migration, so assert it directly. Use a scratch flat, not `TEST_FLAT_ID`.

```bash
npx supabase db query --file - <<'SQL'
begin;
insert into flats (id, name) values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'constraint probe');
insert into flat_meals (flat_id, name, basis, serve_time, open_offset_min, close_time, dispatch_offset_min)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Breakfast', 'breakfast', '08:00', 840, '07:00', 90),
       ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Dinner', 'full', '20:30', 690, '16:00', 270);
insert into daily_polls (flat_id, flat_meal_id, poll_date, status)
select flat_id, id, current_date, 'open' from flat_meals where flat_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
select count(*) as polls_on_one_date from daily_polls where flat_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
rollback;
SQL
```
Expected: `polls_on_one_date = 2`, then rolled back so nothing persists.

- [ ] **Step 9: Commit**

```bash
git add docs/05-schema.sql supabase/migrations/20260813000000_per_meal_polls.sql
git commit -m "Key polls per meal, and make a group's meals real rows

A group can be labeled with several meals, but the backend had no meal
dimension -- meals lived in device-local AsyncStorage, so a
breakfast-and-dinner group still got one poll a day.

Add flat_meals (free-text name + fixed suggestion basis + a schedule
anchored on serve_time, where open_offset_min may exceed a day so
breakfast opens the previous evening). Key daily_polls and day_attendance
per meal, and add recipes.suitable_bases for meal-aware suggestions.

Every existing flat backfills to a single Dinner meal carrying its
current schedule, so the pipeline and app behave identically. The
flats.poll_*_time columns stay until part 2 stops reading them."
```

---

### Task 2: Keep the e2e suite green against the new key

**Files:**
- Modify: `app/e2e/fixtures/seed-poll.ts:12-25` (the `on conflict` clause and the insert)
- Modify: `app/e2e/fixtures/poll-state.ts:58-76` (`resetPollState`, `getPollForDate`)
- Test: the existing suite — `app/e2e/tests/*.spec.ts` (28 tests, unchanged)

**Interfaces:**
- Consumes: `flat_meals` and `daily_polls.flat_meal_id` from Task 1.
- Produces: `seedOpenPoll(dishSlugs, flatId?, date?)` and `getPollForDate(flatId?, date?)` keep their existing signatures — callers in the six spec files must not need edits.

**Why this task exists:** `seed-poll.ts:16` says `on conflict (flat_id, poll_date)`. Task 1 drops that exact constraint, so this fixture throws at runtime and takes the whole suite with it. This is not optional cleanup — it is the migration's blast radius.

- [ ] **Step 1: Run the suite to see the expected breakage**

Prerequisite: a dev server on port 8081 (`npx expo start --web --port 8081`; the Playwright config reuses one already running) and `SUPA_JWT` set in `app/.env`.

Run: `cd app && npm run test:e2e -- --reporter=line`
Expected: failures in specs that call `seedOpenPoll` (accompaniment, cart-multiuser, grocery-and-dispatch, poll-lifecycle), with a Postgres error naming the missing `flat_id, poll_date` constraint. Note which tests fail — Step 5 compares against this.

- [ ] **Step 2: Add a meal-resolving helper to `seed-poll.ts`**

Add above `seedOpenPoll`:

```ts
// Resolves the flat's default (first, by position) meal. Part 1 backfills
// every existing flat to exactly one 'Dinner' meal, so tests that don't
// care about meals get the same single-poll behavior they had before the
// per-meal migration.
function defaultMealIdSql(flatId: string): string {
  return `(select id from flat_meals where flat_id = '${flatId}' and is_active order by position, created_at limit 1)`;
}
```

- [ ] **Step 3: Update `seedOpenPoll` to key by meal**

Replace the body of `seedOpenPoll` (lines 13-24) with:

```ts
  dbQuery(`
    insert into daily_polls (flat_id, flat_meal_id, poll_date, status)
    values ('${flatId}', ${defaultMealIdSql(flatId)}, '${date}', 'open')
    on conflict (flat_id, poll_date, flat_meal_id) do update set status = 'open';

    insert into poll_options (poll_id, recipe_id, position)
    select dp.id, r.id, v.position
    from (values ${dishSlugs.map((slug, i) => `('${slug}', ${i + 1})`).join(', ')}) as v(slug, position)
    join daily_polls dp on dp.flat_id = '${flatId}' and dp.poll_date = '${date}'
    join recipes r on r.slug = v.slug
    on conflict (poll_id, recipe_id) do nothing;
  `);
```

- [ ] **Step 4: Make `getPollForDate` deterministic**

`getPollForDate` returns `rows[0]` from a query that can now match several polls. With one backfilled meal per flat it still returns one row, but the ordering is unspecified — make it explicit so it stays correct as soon as a second meal exists. Replace the query at `poll-state.ts:72-74`:

```ts
  const rows = dbQuery(
    `select dp.id, dp.status from daily_polls dp
     join flat_meals m on m.id = dp.flat_meal_id
     where dp.flat_id = '${flatId}' and dp.poll_date = '${date}'
     order by m.position, m.created_at limit 1;`
  ) as Record<string, unknown>[];
```

`resetPollState` needs **no change** — its deletes are all `flat_id + poll_date` scoped, which correctly removes every meal's poll for that date.

- [ ] **Step 5: Run the suite and confirm it is green again**

Run: `cd app && npm run test:e2e -- --reporter=line`
Expected: the tests that failed in Step 1 now pass, and the total matches the pre-migration baseline (28 tests). Any test failing here that also failed before the migration is pre-existing and out of scope — say so rather than fixing it silently.

- [ ] **Step 6: Typecheck the e2e sources**

Run: `cd app && npm run test:e2e:typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/e2e/fixtures/seed-poll.ts app/e2e/fixtures/poll-state.ts
git commit -m "Point e2e poll fixtures at the per-meal key

seedOpenPoll upserted on (flat_id, poll_date), the constraint the
per-meal migration replaces, so every spec that seeds a poll threw once
it landed. Resolve the flat's default meal and upsert on the new
(flat_id, poll_date, flat_meal_id) key instead.

getPollForDate also gains an explicit order-by: its query can match
several polls once a flat runs more than one meal, and rows[0] of an
unordered result is not a choice."
```

---

## Self-Review

**Spec coverage.** Every section of `2026-08-13-per-meal-polls-1-schema.md` maps to a step: `flat_meals` DDL → T1S1/T1S4; `daily_polls` re-key → T1S2/T1S4; `day_attendance` re-key → T1S3/T1S4; `recipes.suitable_bases` → T1S3/T1S4; RLS → T1S4; backfill incl. the negative-offset guard → T1S4; "unchanged tables" → verified by T2S5 (the suite exercises `cart_items`, `poll_options`, `grocery_checks`, `dispatch_log` through the unchanged `poll_id` path); every spec verification bullet → T1S7/T1S8/T2S5.

**Deviation from the spec, deliberate:** the spec's verification section says "test flats must keep exactly one meal" during part 1 and treats the e2e suite as incidental. Task 2 exists because the suite is not incidental — `seed-poll.ts:16` hard-codes the dropped constraint. The spec's intent (part 1 changes no behavior) is preserved; this is the work that makes it true.

**Placeholder scan:** none. Every step carries real SQL/TS and a concrete expected result.

**Type consistency:** `flat_meal_id` is spelled identically across the schema doc, migration, and both fixtures. `defaultMealIdSql` is defined in T2S2 before use in T2S3. `seedOpenPoll`/`getPollForDate` signatures are unchanged, so the six spec files need no edits — as asserted in T2's Interfaces block.

## Verification

Part 1 is done when:
1. `npx supabase db push` applies cleanly.
2. All four queries in T1S7 return their expected values.
3. T1S8 proves two polls coexist on one date, then rolls back.
4. `npm run test:e2e` matches the pre-migration baseline.
5. `npm run test:e2e:typecheck` is clean.

**Known gate carried into part 3:** `app/src/hooks/use-today-cart.ts:88-93` resolves the poll with `.maybeSingle()` and throws on a second poll for one date. No group may be given a second meal in production until part 3 ships. Part 1 is safe because the backfill gives every flat exactly one meal.
