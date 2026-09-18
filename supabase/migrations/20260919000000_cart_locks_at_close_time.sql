begin;
-- The cart's write policy keyed only on daily_polls.status = 'open', and status
-- flips when close_poll's 15-minute cron tick runs — so a cart stayed editable
-- for up to 15 minutes after its displayed close time. The close moment itself
-- is now part of the policy; close_poll still flips the status afterwards, which
-- is what dispatch_cook and the rest of the app read.
drop policy "cart_items: members write while open" on public.cart_items;
create policy "cart_items: members write while open" on public.cart_items
  for all using (
    exists (
      select 1 from public.daily_polls p
      join public.flat_meals m on m.id = p.flat_meal_id
      where p.id = cart_items.poll_id
        and public.is_flat_member(p.flat_id)
        and p.status = 'open'
        and ((p.poll_date + m.close_time) at time zone 'Asia/Kolkata') > now()
    )
  ) with check (
    exists (
      select 1 from public.daily_polls p
      join public.flat_meals m on m.id = p.flat_meal_id
      where p.id = cart_items.poll_id
        and public.is_flat_member(p.flat_id)
        and p.status = 'open'
        and ((p.poll_date + m.close_time) at time zone 'Asia/Kolkata') > now()
    )
  );
commit;
