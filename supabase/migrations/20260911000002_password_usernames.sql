-- Login identifiers are private. Never expose a username-to-email RPC to anon.
create table public.login_usernames (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z][a-z0-9_]{2,29}$')
);
alter table public.login_usernames enable row level security;
revoke all on public.login_usernames from anon, authenticated;
grant select on public.login_usernames to authenticated;
create policy own_login_username on public.login_usernames for select to authenticated using (auth.uid() = user_id);
grant all on public.login_usernames to service_role;

create function public.reserve_signup_username() returns trigger
language plpgsql security definer set search_path = '' as $$
declare requested text := lower(trim(new.raw_user_meta_data->>'username'));
begin
  if requested is not null and requested <> '' then
    insert into public.login_usernames(user_id,username) values(new.id,requested);
  end if;
  return new;
end $$;
revoke all on function public.reserve_signup_username() from public, anon, authenticated;
create trigger reserve_signup_username after insert on auth.users
for each row execute function public.reserve_signup_username();

-- Service-only limiter, atomic across concurrent Edge workers. The caller
-- supplies SHA-256 identifiers; neither passwords nor raw IPs are stored.
create table public.password_login_limits (
  key text primary key,
  started_at timestamptz not null default now(),
  attempts integer not null default 1
);
alter table public.password_login_limits enable row level security;
revoke all on public.password_login_limits from anon, authenticated;
create function public.allow_password_login(p_key text, p_limit integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare attempts_used integer;
begin
  if p_limit < 1 or p_limit > 100 or length(p_key) <> 64 then return false; end if;
  delete from public.password_login_limits where started_at < now() - interval '1 day';
  insert into public.password_login_limits as limits(key) values(p_key)
  on conflict(key) do update set
    attempts = case when limits.started_at < now() - interval '15 minutes' then 1 else limits.attempts + 1 end,
    started_at = case when limits.started_at < now() - interval '15 minutes' then now() else limits.started_at end
  returning attempts into attempts_used;
  return attempts_used <= p_limit;
end $$;
revoke all on function public.allow_password_login(text,integer) from public, anon, authenticated;
grant execute on function public.allow_password_login(text,integer) to service_role;
