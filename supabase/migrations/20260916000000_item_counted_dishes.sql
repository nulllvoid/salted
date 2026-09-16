-- Item-counted dishes: cart quantity counts pieces, not portions.
--
-- Two people eating 2 and 3 rotis need 5 rotis — a number that exceeds
-- headcount and counts items. validate_cart_dish's headcount cap is a real
-- typo guard for portions (20 servings of paneer kurma in a 2-person flat is
-- a mistake) so it stays; item dishes get a fixed ceiling instead.
--
-- kind cannot carry this signal: 483 of 486 active recipes are 'main', and
-- item-counting cuts across it (Roti is an accompaniment, Set Dosa a main).

alter table public.recipes
  add column if not exists is_item_counted boolean not null default false;

update public.recipes set is_item_counted = true
where name in ('Roti', 'Akki Rotti (Rice Flatbread)', 'Dosa with Coconut Chutney', 'Set Dosa');

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
  if new.quantity < 1 then
    raise exception 'Quantity must be at least 1';
  elsif not v_recipe.is_item_counted and new.quantity > v_count then
    raise exception 'Servings exceed the number of people eating';
  elsif v_recipe.is_item_counted and new.quantity > 99 then
    raise exception 'Quantity is too large';
  end if;
  return new;
end $$;
