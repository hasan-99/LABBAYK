alter table public.orders add column driver_id uuid references auth.users(id) on delete restrict;
alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('requested','quoted','searching','accepted','assigned','shopping','awaiting_approval','delivering','delivered','cancelled'));
create index orders_driver_created_idx on public.orders (driver_id, created_at desc) where driver_id is not null;

alter table public.driver_profiles add column is_online boolean not null default false;
alter table public.driver_profiles add column service_zone_id uuid references public.service_zones(id);
create index driver_profiles_dispatch_idx on public.driver_profiles (service_zone_id, user_id) where review_status = 'approved' and is_online;
grant update (is_online, service_zone_id) on public.driver_profiles to authenticated;

create table public.order_offers (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  driver_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','expired','revoked')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (order_id, driver_id),
  check ((status = 'pending') = (responded_at is null))
);
create index order_offers_driver_active_idx on public.order_offers (driver_id, expires_at) where status = 'pending';
create index order_offers_order_status_idx on public.order_offers (order_id, status);
alter table public.order_offers enable row level security;
create policy order_offers_read_driver_or_admin on public.order_offers
  for select to authenticated using (driver_id = (select auth.uid()) or (select private.is_admin()));
grant select on public.order_offers to authenticated;

drop policy orders_customer_select on public.orders;
create policy orders_customer_driver_admin_select on public.orders
  for select to authenticated using (
    customer_id = (select auth.uid())
    or (select private.is_admin())
    or driver_id = (select auth.uid())
    or exists (
      select 1 from public.order_offers o
      where o.order_id = id and o.driver_id = (select auth.uid())
        and o.status = 'pending' and o.expires_at > now()
    )
  );
grant select on public.orders to authenticated;

create or replace function public.dispatch_order(p_order_id uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_count integer;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status <> 'requested' or v_order.driver_id is not null then raise exception 'Order is not ready for dispatch'; end if;

  select count(*) into v_count from public.driver_profiles
  where service_zone_id = v_order.zone_id and review_status = 'approved' and is_online;
  if v_count = 0 then raise exception 'No approved online drivers in this zone'; end if;

  insert into public.order_offers(order_id, driver_id, expires_at)
  select v_order.id, dp.user_id, now() + interval '90 seconds'
  from public.driver_profiles dp
  where dp.service_zone_id = v_order.zone_id and dp.review_status = 'approved' and dp.is_online
  on conflict (order_id, driver_id) do update
    set status = 'pending', expires_at = excluded.expires_at, created_at = now(), responded_at = null
    where public.order_offers.status <> 'accepted';
  update public.orders set status = 'searching' where id = v_order.id;
  return v_count;
end;
$$;
revoke all on function public.dispatch_order(uuid) from public, anon;
grant execute on function public.dispatch_order(uuid) to authenticated;

create or replace function public.accept_order_offer(p_offer_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_driver_id uuid := auth.uid();
  v_offer public.order_offers%rowtype;
  v_order public.orders%rowtype;
begin
  if v_driver_id is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.user_roles ur join public.driver_profiles dp on dp.user_id = ur.user_id
    where ur.user_id = v_driver_id and ur.role = 'driver' and dp.review_status = 'approved' and dp.is_online
  ) then raise exception 'Approved online driver access required'; end if;

  select * into v_offer from public.order_offers
  where id = p_offer_id and driver_id = v_driver_id and status = 'pending' and expires_at > now()
  for update;
  if not found then raise exception 'Offer expired or unavailable'; end if;

  select * into v_order from public.orders where id = v_offer.order_id for update;
  if not found or v_order.status <> 'searching' or v_order.driver_id is not null then raise exception 'Another driver already accepted this order'; end if;

  update public.orders set status = 'accepted', driver_id = v_driver_id where id = v_order.id;
  update public.order_offers set status = 'accepted', responded_at = now() where id = v_offer.id;
  update public.order_offers set status = 'revoked', responded_at = now()
    where order_id = v_order.id and id <> v_offer.id and status = 'pending';
  return v_order.id;
end;
$$;
revoke all on function public.accept_order_offer(uuid) from public, anon;
grant execute on function public.accept_order_offer(uuid) to authenticated;
