-- FlatMeal v1 schema (Supabase / Postgres)
-- Source of truth. Edit here first, then generate a migration.
-- RLS: all flat-scoped tables restricted to that flat's members; recipe tables global read-only.

-- ============ identity & household ============

create table profiles (                      -- 1:1 with auth.users
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  diet_type text not null default 'veg' check (diet_type in ('veg','egg','nonveg')),
  is_jain boolean not null default false,
  allergies text[] not null default '{}',    -- values from: peanut,dairy,gluten,shellfish,soy
  phone text,                                -- the member's own number; distinct from cooks.phone, not an auth identifier
  push_token text,
  notifications_muted boolean not null default false,
  created_at timestamptz not null default now()
);

create table flats (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default encode(gen_random_bytes(6),'hex'),
  poll_open_time time not null default '09:00',
  poll_close_time time not null default '11:00',
  dispatch_time time not null default '16:00',
  tz text not null default 'Asia/Kolkata',
  max_mains int,                              -- soft cap on distinct main-course cart lines; null = no limit set (onboarding step is skippable). Warn-only, never enforced server-side.
  max_accompaniments int,                     -- soft cap covering both 'accompaniment' and 'side' cart lines combined; null = no limit set
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table flat_members (
  flat_id uuid not null references flats(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('admin','member')),
  joined_at timestamptz not null default now(),
  primary key (flat_id, user_id)
);

create table cooks (                          -- separate table: supports cook turnover history
  id uuid primary key default gen_random_uuid(),
  flat_id uuid not null references flats(id) on delete cascade,
  name text not null,
  phone text not null,                        -- E.164
  language text not null default 'hi' check (language in ('hi','kn','en')),
  is_active boolean not null default true,
  audit_note text,                            -- who changed what, plain text
  created_at timestamptz not null default now()
);
create unique index one_active_cook_per_flat on cooks(flat_id) where is_active;

-- ============ recipe dataset (global, curated) ============

create table recipes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,                  -- 'palak-paneer'
  name text not null,
  cuisine text not null,                      -- north_indian | south_indian | ...
  base text not null,                         -- primary base for variety heuristic: paneer|dal|rice|roti-sabzi|...
  kind text not null default 'main' check (kind in ('main','accompaniment','side')),  -- 'accompaniment' = roti/rice/etc, 'side' = pickle/raita/papad/salad; both paired to mains via recipe_accompaniments
  diet_class text not null check (diet_class in ('veg','egg','nonveg')),
  jain_ok boolean not null default false,
  allergens text[] not null default '{}',
  seasons text[] not null default '{kharif,rabi,zaid}',  -- static seasonality tags (all = year-round)
  suitable_bases text[] not null default '{full}',  -- which flat_meals.basis values this dish suits
  instructions_en text not null,              -- imperative, written for the cook
  image_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  name_en text not null,                      -- 'Spinach (palak)'
  name_hi text,
  name_kn text,
  qty_per_person numeric not null,            -- multiplied by headcount, then rounded per unit rules
  unit text not null check (unit in ('piece','g','ml','bunch','packet','cup','tbsp','tsp')),
  category text not null check (category in ('vegetable','dairy','staple','protein','other')),
  is_staple boolean not null default false,   -- staples render as "check you have:" line, excluded from buy list
  sort_order int not null default 0
);

create table recipe_translations (            -- reviewed translation cache for instruction bodies
  recipe_id uuid not null references recipes(id) on delete cascade,
  language text not null check (language in ('hi','kn')),
  instructions text not null,
  reviewed_by text,
  reviewed_at timestamptz,
  primary key (recipe_id, language)
);

-- curated mapping: which accompaniment (kind='accompaniment') recipes are
-- valid for a given main dish. Absence of any row for a main_recipe_id means
-- that dish has no accompaniment (e.g. Vegetable Pulao already IS the
-- starch) — not an error state, just zero options at poll time.
create table recipe_accompaniments (
  main_recipe_id uuid not null references recipes(id) on delete cascade,
  accompaniment_recipe_id uuid not null references recipes(id) on delete cascade,
  sort_order int not null default 0,
  primary key (main_recipe_id, accompaniment_recipe_id)
);

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

-- ============ daily loop ============

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

-- Suggested mains for the day — a fixed candidate list computed once by
-- create_poll (seeded by flat_id+poll_date). "Offered," not "voted on" — a
-- recipe here may or may not also appear in cart_items.
create table poll_options (
  poll_id uuid not null references daily_polls(id) on delete cascade,
  recipe_id uuid not null references recipes(id),
  position int not null check (position between 1 and 3),
  primary key (poll_id, recipe_id)
);

-- Suggested accompaniments — also computed once by create_poll, sourced from
-- the union of recipe_accompaniments for all recipes in poll_options. 0 rows
-- is a valid, non-error state (e.g. all suggested mains already are the
-- starch, like Vegetable Pulao).
create table poll_accompaniment_options (
  poll_id uuid not null references daily_polls(id) on delete cascade,
  recipe_id uuid not null references recipes(id),
  position int not null check (position between 1 and 3),
  primary key (poll_id, recipe_id)
);

-- Shared, live-edited cart: one row per (poll, recipe) — NOT per-user, unlike
-- the old votes table. quantity is the single shared value all members see
-- and edit; 0 means "not in the cart" and is never stored (row is deleted
-- instead). Both main-course and accompaniment lines live in this one table,
-- differentiated by recipes.kind via join, since a flat's dinner can include
-- any number of dishes of either kind (no cap on distinct dishes, only on
-- each dish's quantity, enforced client-side against headcount).
create table cart_items (
  poll_id uuid not null references daily_polls(id) on delete cascade,
  recipe_id uuid not null references recipes(id),
  quantity int not null check (quantity > 0),
  added_by uuid references profiles(id),      -- who first added this line (attribution only)
  updated_by uuid references profiles(id),    -- who last edited the quantity
  updated_at timestamptz not null default now(),
  primary key (poll_id, recipe_id)
);

create table day_attendance (                 -- "I'm out for this meal"
  flat_id uuid not null references flats(id) on delete cascade,
  flat_meal_id uuid not null references flat_meals(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  poll_date date not null,
  is_out boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (flat_id, user_id, poll_date, flat_meal_id)
);

-- Live "who did what" feed for the cart screen (mockup: "who did what" /
-- "Ashutosh added Rajma" / "Shri is out tonight"). Bespoke rather than
-- derived from cart_items/day_attendance directly: those tables only hold
-- current state (one row per poll+recipe / flat+user+date), so a second
-- edit overwrites the first with no way to reconstruct a chronological feed
-- afterwards. Written by the app in the same call that mutates cart_items
-- or day_attendance, not via a trigger.
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  flat_id uuid not null references flats(id) on delete cascade,
  poll_id uuid references daily_polls(id) on delete cascade,   -- null for events not tied to a specific day's poll
  actor_id uuid references profiles(id),
  event_type text not null check (event_type in
    ('cart_add','cart_remove','cart_quantity_change','attendance_change')),
  recipe_id uuid references recipes(id),        -- set for cart_* events, null for attendance_change
  detail jsonb not null default '{}',           -- cart_quantity_change: {from_qty, to_qty}; attendance_change: {is_out, reason}
  created_at timestamptz not null default now()
);
create index activity_log_poll on activity_log(poll_id, created_at desc);

create table grocery_checks (                 -- "we already have this" ticks, realtime-synced
  poll_id uuid not null references daily_polls(id) on delete cascade,
  ingredient_id uuid not null references recipe_ingredients(id),
  checked_by uuid references profiles(id),
  checked_at timestamptz not null default now(),
  primary key (poll_id, ingredient_id)
);

create table dispatch_log (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references daily_polls(id) on delete cascade,
  mode text not null check (mode in ('mock','live')),
  language text not null,
  headcount int not null,
  payload_en text not null,
  payload_translated text not null,
  bsp_message_id text,
  status text not null default 'queued' check (status in ('queued','mocked','sent','delivered','read','failed')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- flat's meal history for the 10-day exclusion rule: derived from cart_items
-- joined to daily_polls where status='dispatched' (no separate history
-- table needed — cart_items is the cart/order-line table, not a bespoke
-- history table, so this join returns the SET of recipe ids served on each
-- dispatched day).
create index polls_flat_date on daily_polls(flat_id, poll_date desc);

-- take_fallback_cart_item(poll_id, recipe_id, quantity): security-definer
-- RPC letting a flat member write a cart_items row for a 'closed' (locked)
-- poll that has zero cart_items — the empty-cart-at-lock edge state's
-- "take the fallback" action. cart_items' own RLS blocks writes once a
-- poll leaves 'open' (that IS the lock mechanism), so this is a narrow,
-- guarded exception rather than a general write-after-lock allowance: it
-- verifies flat membership, the poll's status is exactly 'closed', and the
-- cart is still empty before inserting. See
-- supabase/migrations/20260109000002_take_fallback_rpc.sql for the body.

-- ============ pilot feedback & ops ============

create table meal_feedback (                  -- next-morning 👍/👎
  poll_id uuid not null references daily_polls(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  thumbs_up boolean not null,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

create table feedback (                       -- free-text app feedback
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  flat_id uuid references flats(id),
  body text not null,
  created_at timestamptz not null default now()
);

create table pipeline_errors (
  id uuid primary key default gen_random_uuid(),
  stage text not null,                        -- create_poll | close_poll | dispatch_cook | wa_webhook
  flat_id uuid,
  detail jsonb not null,
  created_at timestamptz not null default now()
);
begin;

-- Household creation is atomic: no orphaned flat if membership or meals fail.
create or replace function public.create_household(p_name text, p_meals text[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_meal text; v_position integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(btrim(p_name)) not between 1 and 80 then raise exception 'Invalid household name'; end if;
  if p_meals is null or cardinality(p_meals) not between 1 and 3 or not p_meals <@ array['breakfast','lunch','dinner']::text[] then raise exception 'Invalid meals'; end if;
  if not exists(select 1 from public.profiles where id = auth.uid()) then raise exception 'Complete your profile first'; end if;
  insert into public.flats(name, created_by) values(btrim(p_name), auth.uid()) returning id into v_id;
  insert into public.flat_members(flat_id, user_id, role) values(v_id, auth.uid(), 'admin');
  delete from public.flat_meals where flat_id = v_id;
  for v_meal in select distinct unnest(p_meals) loop
    insert into public.flat_meals(flat_id, name, basis, serve_time, close_time, open_offset_min, dispatch_offset_min, position)
    values(v_id, initcap(v_meal), case when v_meal = 'breakfast' then 'breakfast' else 'full' end,
      case v_meal when 'breakfast' then '08:30'::time when 'lunch' then '13:00'::time else '20:30'::time end,
      case v_meal when 'breakfast' then '07:00'::time when 'lunch' then '10:00'::time else '16:00'::time end,
      case v_meal when 'breakfast' then 720 when 'lunch' then 300 else 690 end,
      case v_meal when 'breakfast' then 60 when 'lunch' then 120 else 270 end, v_position);
    v_position := v_position + 1;
  end loop;
  return v_id;
end $$;

create or replace function public.join_household(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_code is null or lower(btrim(p_code)) !~ '^[0-9a-f]{12}$' then raise exception 'Invalid invite code'; end if;
  select id into v_id from public.flats where invite_code = lower(btrim(p_code));
  if v_id is null then raise exception 'Invalid invite code'; end if;
  insert into public.flat_members(flat_id, user_id, role) values(v_id, auth.uid(), 'member') on conflict(flat_id,user_id) do nothing;
  return v_id;
end $$;

-- A guessed household UUID must never be sufficient to join it.
drop policy if exists "flat_members: self join" on public.flat_members;

create or replace function public.set_grocery_checked(p_sources jsonb, p_checked boolean)
returns void language plpgsql security invoker set search_path = '' as $$
declare source jsonb; v_poll uuid; v_ingredient uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_sources) <> 'array' or jsonb_array_length(p_sources) > 200 then raise exception 'Invalid grocery list'; end if;
  for source in select * from jsonb_array_elements(p_sources) loop
    v_poll := (source->>'pollId')::uuid; v_ingredient := (source->>'ingredientId')::uuid;
    if not exists(select 1 from public.daily_polls p join public.cart_items c on c.poll_id = p.id join public.recipe_ingredients i on i.recipe_id = c.recipe_id where p.id = v_poll and i.id = v_ingredient and public.is_flat_member(p.flat_id)) then raise exception 'Permission denied'; end if;
    if p_checked then
      insert into public.grocery_checks(poll_id, ingredient_id, checked_by) values(v_poll,v_ingredient,auth.uid()) on conflict(poll_id,ingredient_id) do nothing;
    else delete from public.grocery_checks where poll_id = v_poll and ingredient_id = v_ingredient;
    end if;
  end loop;
end $$;

revoke all on function public.create_household(text,text[]) from public, anon;
revoke all on function public.join_household(text) from public, anon;
revoke all on function public.set_grocery_checked(jsonb,boolean) from public, anon;
grant execute on function public.create_household(text,text[]) to authenticated;
grant execute on function public.join_household(text) to authenticated;
grant execute on function public.set_grocery_checked(jsonb,boolean) to authenticated;

-- Members can edit a note, never unlock a poll or claim it was dispatched.
revoke update on public.daily_polls from authenticated, anon;
grant update(flat_note) on public.daily_polls to authenticated;

notify pgrst, 'reload schema';
commit;
alter function public.create_default_flat_meal() set search_path = public;
alter function public.is_flat_member(uuid) set search_path = public;
begin;
-- Server-side counterparts to the meal editor's validation.
alter table public.flat_meals add constraint meal_schedule_valid check (
  length(btrim(name)) between 1 and 60 and
  close_time < serve_time and
  open_offset_min between 1 and 2880 and
  dispatch_offset_min between 0 and 2880 and
  open_offset_min > extract(epoch from (serve_time-close_time))/60 and
  dispatch_offset_min <= extract(epoch from (serve_time-close_time))/60
);

-- An attendance row must refer to a member and meal of the same household.
create or replace function public.validate_attendance()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.flat_meals where id=new.flat_meal_id and flat_id=new.flat_id) or
     not exists(select 1 from public.flat_members where user_id=new.user_id and flat_id=new.flat_id) then
    raise exception 'Attendance must belong to this household and meal';
  end if;
  if auth.uid() is not null and exists(select 1 from public.daily_polls where flat_meal_id=new.flat_meal_id and poll_date=new.poll_date and status<>'open') then
    raise exception 'Attendance is locked for this meal';
  end if;
  return new;
end $$;
create trigger attendance_integrity before insert or update on public.day_attendance for each row execute function public.validate_attendance();

-- Client filtering helps discovery; the database enforces dietary constraints
-- and fresh headcounts even for direct API writes and the fallback RPC.
create or replace function public.validate_cart_dish()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_poll public.daily_polls; v_recipe public.recipes; v_count integer;
begin
  select * into v_poll from public.daily_polls where id=new.poll_id for update;
  select * into v_recipe from public.recipes where id=new.recipe_id and is_active;
  if v_recipe.id is null then raise exception 'Dish is unavailable'; end if;
  if exists(
    select 1 from public.flat_members m join public.profiles p on p.id=m.user_id
    where m.flat_id=v_poll.flat_id and (
      (case v_recipe.diet_class when 'veg' then 0 when 'egg' then 1 else 2 end) >
      (case p.diet_type when 'veg' then 0 when 'egg' then 1 else 2 end) or
      (p.is_jain and not v_recipe.jain_ok) or p.allergies && v_recipe.allergens
    )
  ) then raise exception 'Dish does not match household dietary preferences'; end if;
  select count(*) into v_count from public.flat_members m where m.flat_id=v_poll.flat_id and not exists(
    select 1 from public.day_attendance a where a.flat_meal_id=v_poll.flat_meal_id and a.poll_date=v_poll.poll_date and a.user_id=m.user_id and a.is_out
  );
  if new.quantity < 1 or new.quantity > v_count then raise exception 'Servings exceed the number of people eating'; end if;
  return new;
end $$;
create trigger cart_diet_and_headcount before insert or update on public.cart_items for each row execute function public.validate_cart_dish();

-- Serialize fallback claims; two housemates cannot both fill an empty menu.
create or replace function public.take_fallback_cart_item(p_poll_id uuid,p_recipe_id uuid,p_quantity int)
returns void language plpgsql security definer set search_path = '' as $$
declare v_poll public.daily_polls;
begin
  select * into v_poll from public.daily_polls where id=p_poll_id for update;
  if auth.uid() is null or not public.is_flat_member(v_poll.flat_id) then raise exception 'Permission denied'; end if;
  if v_poll.status <> 'closed' or exists(select 1 from public.cart_items where poll_id=p_poll_id) then raise exception 'Backup is only available for a closed, empty menu'; end if;
  insert into public.cart_items(poll_id,recipe_id,quantity,added_by,updated_by) values(p_poll_id,p_recipe_id,p_quantity,auth.uid(),auth.uid());
end $$;
revoke all on function public.take_fallback_cart_item(uuid,uuid,int) from public,anon;
grant execute on function public.take_fallback_cart_item(uuid,uuid,int) to authenticated;

-- Hand-curated suitability; never label generated bhurji variants as breakfast.
update public.recipes set suitable_bases=array['breakfast','light','full'] where slug in ('dosa-with-chutney','masala-omelette','set-dosa','besan-chilla','uppittu','poha');
update public.recipes set suitable_bases=array['light','full'] where slug in ('curd-rice','lemon-rice','moong-dal-khichdi','plain-khichdi','veg-khichdi','paneer-khichdi','mushroom-khichdi','peas-khichdi');
notify pgrst, 'reload schema';
commit;
begin;
-- The deployed scheduler scans today and tomorrow. Keep every selectable
-- opening moment within that horizon instead of accepting a 48-hour offset
-- that the scheduler cannot open on time.
alter table public.flat_meals add constraint meal_open_within_scheduler_window check (open_offset_min <= 1440);
commit;
