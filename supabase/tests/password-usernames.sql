begin;
do $$
declare first_id uuid := gen_random_uuid(); other_id uuid := gen_random_uuid(); alias text := 'test_' || replace(gen_random_uuid()::text,'-','');
begin
  alias := left(alias,30);
  insert into auth.users(id,raw_user_meta_data) values(first_id,jsonb_build_object('username',upper(alias)));
  if not exists(select 1 from public.login_usernames where user_id=first_id and username=alias) then raise exception 'Username normalization failed'; end if;
  begin
    insert into auth.users(id,raw_user_meta_data) values(other_id,jsonb_build_object('username',alias));
    raise exception 'Duplicate username was accepted';
  exception when unique_violation then null;
  end;
  update auth.users set raw_user_meta_data=jsonb_build_object('username','changed_name') where id=first_id;
  if not exists(select 1 from public.login_usernames where user_id=first_id and username=alias) then raise exception 'Mutable metadata changed login identity'; end if;
  if has_table_privilege('anon','public.login_usernames','select') then raise exception 'Anonymous users can read aliases'; end if;
  if has_function_privilege('anon','public.allow_password_login(text,integer)','execute') then raise exception 'Anonymous limiter access'; end if;
  if not public.allow_password_login(repeat('a',64),1) or public.allow_password_login(repeat('a',64),1) then raise exception 'Rate limit failed'; end if;
  delete from auth.users where id=first_id;
  if exists(select 1 from public.login_usernames where user_id=first_id) then raise exception 'Alias cleanup failed'; end if;
end $$;
select 'Username uniqueness, privacy, immutable identity, limiter and cleanup passed' as verification;
rollback;
