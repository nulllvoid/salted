-- Run inside a transaction and always roll back these isolated fixtures.
insert into auth.users(id,email) values
 ('fa100000-0000-4000-8000-000000000001','salted-check-1@example.invalid'),
 ('fa100000-0000-4000-8000-000000000002','salted-check-2@example.invalid');
insert into public.profiles(id,display_name) values
 ('fa100000-0000-4000-8000-000000000001','Release check one'),
 ('fa100000-0000-4000-8000-000000000002','Release check two');
create temp table release_check(household uuid, code text);
grant all on release_check to authenticated;
set local request.jwt.claim.sub = 'fa100000-0000-4000-8000-000000000001';
set local role authenticated;
insert into release_check(household) select public.create_household('Release verification',array['breakfast','dinner']);
update release_check set code = (select invite_code from public.flats where id = household);
do $$ begin
  if (select count(*) from public.flat_meals where flat_id = (select household from release_check)) <> 2 then raise exception 'Meal creation failed'; end if;
  if (select count(*) from public.flat_members where flat_id = (select household from release_check)) <> 1 then raise exception 'Owner membership missing'; end if;
end $$;
set local request.jwt.claim.sub = 'fa100000-0000-4000-8000-000000000002';
do $$ begin
  if exists(select 1 from public.flats where id = (select household from release_check)) then raise exception 'Household leaked to non-member'; end if;
  begin
    insert into public.flat_members(flat_id,user_id) select household,auth.uid() from release_check;
    raise exception 'Direct join unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
select public.join_household((select upper(code) from release_check));
select public.join_household((select code from release_check));
do $$ begin
  if (select count(*) from public.flat_members where flat_id = (select household from release_check)) <> 2 then raise exception 'Join is not idempotent'; end if;
  if has_column_privilege('authenticated','public.daily_polls','status','UPDATE') then raise exception 'Members can mutate pipeline status'; end if;
  if not has_column_privilege('authenticated','public.daily_polls','flat_note','UPDATE') then raise exception 'Note editing was lost'; end if;
end $$;
reset role;
select 'household creation, invite joining, idempotency and access control passed' as verification;
