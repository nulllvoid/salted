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
