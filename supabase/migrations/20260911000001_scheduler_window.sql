begin;
-- The deployed scheduler scans today and tomorrow. Keep every selectable
-- opening moment within that horizon instead of accepting a 48-hour offset
-- that the scheduler cannot open on time.
alter table public.flat_meals add constraint meal_open_within_scheduler_window check (open_offset_min <= 1440);
commit;
