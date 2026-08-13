-- Per-meal polls, part 1: meals become real rows and polls key per meal.
-- See docs/superpowers/specs/2026-08-13-per-meal-polls-1-schema.md
--
-- A group can be labeled with several meals, but the backend has never had
-- a meal dimension — meals lived in device-local AsyncStorage
-- (app/src/lib/groups-stub.ts), so a "breakfast + dinner" group still got
-- exactly one poll, one cart and one cook message per day.
--
-- flats.poll_open_time / poll_close_time / dispatch_time are deliberately
-- KEPT here: part 2 (the Edge Functions) still reads them. They come out in
-- a later cleanup migration once nothing references them. That is what
-- makes this migration behavior-preserving on its own.

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
