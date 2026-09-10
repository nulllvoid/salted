reset role;
create temp table release_poll(id uuid);
grant all on release_poll to authenticated;
with p as (
  insert into public.daily_polls(flat_id,flat_meal_id,poll_date,status)
  select household,(select id from public.flat_meals where flat_id=household and name='Dinner'),current_date,'open' from release_check returning id
) insert into release_poll select id from p;
set local role authenticated;
do $$
declare r uuid;
begin
  select id into r from public.recipes where slug='steamed-rice';
  begin
    insert into public.cart_items(poll_id,recipe_id,quantity,added_by,updated_by) select id,r,3,auth.uid(),auth.uid() from release_poll;
    raise exception 'Headcount validation failed';
  exception when raise_exception then
    if sqlerrm <> 'Servings exceed the number of people eating' then raise; end if;
  end;
  update public.profiles set allergies=array['dairy'] where id=auth.uid();
  select id into r from public.recipes where slug='palak-paneer';
  begin
    insert into public.cart_items(poll_id,recipe_id,quantity,added_by,updated_by) select id,r,1,auth.uid(),auth.uid() from release_poll;
    raise exception 'Dietary validation failed';
  exception when raise_exception then
    if sqlerrm <> 'Dish does not match household dietary preferences' then raise; end if;
  end;
  insert into public.day_attendance(flat_id,flat_meal_id,user_id,poll_date,is_out)
  select household,(select id from public.flat_meals where flat_id=household and name='Breakfast'),auth.uid(),current_date,true from release_check;
  select id into r from public.recipes where slug='steamed-rice';
  insert into public.cart_items(poll_id,recipe_id,quantity,added_by,updated_by) select id,r,2,auth.uid(),auth.uid() from release_poll;
  if not exists(select 1 from public.cart_items where poll_id=(select id from release_poll) and quantity=2) then raise exception 'Breakfast absence changed dinner portions'; end if;
  begin
    update public.flat_meals set close_time='23:59' where flat_id=(select household from release_check);
    raise exception 'Invalid schedule accepted';
  exception when check_violation then null;
  end;
end $$;
reset role;
select 'dietary veto, quantity cap, meal attendance isolation and schedule validation passed' as verification;
