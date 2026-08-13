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
