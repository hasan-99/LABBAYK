create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

create type public.app_role as enum ('customer', 'driver_pending', 'driver', 'super_admin');
create type public.driver_review_status as enum ('pending', 'approved', 'suspended', 'rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.service_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 100),
  governorate text not null check (char_length(governorate) between 2 and 100),
  city text not null check (char_length(city) between 2 and 100),
  neighborhood text,
  active boolean not null default false,
  delivery_surcharge_minor bigint not null default 0 check (delivery_surcharge_minor >= 0),
  currency text not null default 'SYP' check (currency = 'SYP'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index service_zones_location_unique
  on public.service_zones (governorate, city, coalesce(neighborhood, ''));
create index service_zones_active_idx on public.service_zones (active, governorate, city);

create table public.driver_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  review_status public.driver_review_status not null default 'pending',
  vehicle_description text check (vehicle_description is null or char_length(vehicle_description) <= 160),
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((review_status = 'approved') = (approved_at is not null and approved_by is not null))
);

create table public.driver_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (char_length(token_hash) = 64),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id),
  redeemed_by uuid references auth.users(id),
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((redeemed_by is null) = (redeemed_at is null))
);
create index driver_invites_expiry_idx on public.driver_invites (expires_at) where revoked_at is null;

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  zone_id uuid not null references public.service_zones(id),
  label text not null check (char_length(label) between 1 and 60),
  governorate text not null check (char_length(governorate) between 2 and 100),
  city text not null check (char_length(city) between 2 and 100),
  neighborhood text not null check (char_length(neighborhood) between 1 and 100),
  street text not null check (char_length(street) between 1 and 160),
  landmark text check (landmark is null or char_length(landmark) <= 160),
  building text check (building is null or char_length(building) <= 80),
  floor text check (floor is null or char_length(floor) <= 40),
  notes text check (notes is null or char_length(notes) <= 500),
  contact_phone text not null check (char_length(contact_phone) between 7 and 24),
  latitude double precision,
  longitude double precision,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null)),
  check (latitude is null or latitude between -90 and 90),
  check (longitude is null or longitude between -180 and 180)
);
create index addresses_user_idx on public.addresses (user_id, updated_at desc);
create unique index addresses_one_default_per_user on public.addresses (user_id) where is_default;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role = 'super_admin'::public.app_role
  );
$$;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.set_updated_at() from public, anon, authenticated;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(left(new.raw_user_meta_data ->> 'display_name', 120), ''))
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role)
  values (new.id, 'customer'::public.app_role)
  on conflict (user_id, role) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_new_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

create or replace function private.bootstrap_super_admin(p_identity text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if exists (select 1 from public.user_roles where role = 'super_admin'::public.app_role) then
    raise exception 'A super admin is already configured';
  end if;

  select u.id into v_user_id
  from auth.users as u
  where (lower(u.email) = lower(p_identity) and u.email_confirmed_at is not null)
     or (u.phone = p_identity and u.phone_confirmed_at is not null)
  limit 1;

  if v_user_id is null then
    raise exception 'No confirmed Auth user matches that identity';
  end if;

  insert into public.user_roles (user_id, role)
  values (v_user_id, 'super_admin'::public.app_role);
  return v_user_id;
end;
$$;
revoke all on function private.bootstrap_super_admin(text) from public, anon, authenticated;
grant execute on function private.bootstrap_super_admin(text) to service_role;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger service_zones_set_updated_at before update on public.service_zones
  for each row execute function private.set_updated_at();
create trigger driver_profiles_set_updated_at before update on public.driver_profiles
  for each row execute function private.set_updated_at();
create trigger addresses_set_updated_at before update on public.addresses
  for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.service_zones enable row level security;
alter table public.driver_profiles enable row level security;
alter table public.driver_invites enable row level security;
alter table public.addresses enable row level security;

create policy profiles_select_self_or_admin on public.profiles
  for select to authenticated using (id = (select auth.uid()) or (select private.is_admin()));
create policy profiles_update_self_or_admin on public.profiles
  for update to authenticated using (id = (select auth.uid()) or (select private.is_admin()))
  with check (id = (select auth.uid()) or (select private.is_admin()));

create policy user_roles_select_self_or_admin on public.user_roles
  for select to authenticated using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy service_zones_anon_read_active on public.service_zones
  for select to anon using (active);
create policy service_zones_auth_read_active on public.service_zones
  for select to authenticated using (active or (select private.is_admin()));
create policy service_zones_admin_manage on public.service_zones
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create policy driver_profiles_select_self_or_admin on public.driver_profiles
  for select to authenticated using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy driver_profiles_admin_manage on public.driver_profiles
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create policy driver_invites_admin_manage on public.driver_invites
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create policy addresses_owner_manage on public.addresses
  for all to authenticated using (user_id = (select auth.uid()) or (select private.is_admin()))
  with check (user_id = (select auth.uid()) or (select private.is_admin()));

grant select, update on public.profiles to authenticated;
grant select on public.user_roles, public.driver_profiles to authenticated;
grant select on public.service_zones to anon, authenticated;
grant select, insert, update, delete on public.addresses to authenticated;
