-- Every flat needs at least one meal, or it silently never gets a poll:
-- create_poll resolves the flat's first active flat_meals row and skips the
-- flat when there is none.
--
-- The per-meal migration backfilled existing flats, but nothing guaranteed
-- it for NEW ones — app/src/app/onboarding/create-group.tsx inserts flats +
-- flat_members and knows nothing about meals, so every group created after
-- that migration would have been born meal-less and unpollable.
--
-- A trigger rather than an app-side insert: the app, the e2e fixtures and
-- ad-hoc SQL all create flats, and the invariant should not depend on each
-- of them remembering. Part 3 replaces the meal picker in onboarding, at
-- which point the app may create richer meals up front — this trigger
-- stays as the floor, since it only fires when no meal was supplied.

create or replace function create_default_flat_meal()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Mirrors the Dinner defaults in
  -- docs/superpowers/specs/2026-08-13-per-meal-polls-1-schema.md: served
  -- 20:30, poll opens 09:00 (690 min before), locks 16:00, cook messaged
  -- 16:00 (270 min before).
  insert into flat_meals (flat_id, name, basis, serve_time, open_offset_min, close_time, dispatch_offset_min, position)
  values (new.id, 'Dinner', 'full', '20:30', 690, '16:00', 270, 0);
  return new;
end;
$$;

create trigger flats_default_meal
  after insert on flats
  for each row
  execute function create_default_flat_meal();

-- Backfill any flat that lost its meal (or was created meal-less between
-- the per-meal migration and this trigger).
insert into flat_meals (flat_id, name, basis, serve_time, open_offset_min, close_time, dispatch_offset_min, position)
select f.id, 'Dinner', 'full', '20:30', 690, '16:00', 270, 0
from flats f
where not exists (select 1 from flat_meals m where m.flat_id = f.id);
