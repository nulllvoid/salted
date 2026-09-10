begin;

alter function public.create_default_flat_meal() set search_path = public;
alter function public.is_flat_member(uuid) set search_path = public;

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
