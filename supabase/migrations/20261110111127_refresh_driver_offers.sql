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
  select count(*) into v_count from public.driver_profiles where service_zone_id = v_order.zone_id and review_status = 'approved' and is_online;
  if v_count = 0 then raise exception 'No approved online drivers in this zone'; end if;
  update public.order_offers set status = 'revoked', responded_at = now() where order_id = v_order.id and status = 'pending';
  insert into public.order_offers(order_id, driver_id, expires_at)
  select v_order.id, dp.user_id, now() + interval '90 seconds' from public.driver_profiles dp
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
  if not exists (
    select 1 from public.driver_profiles
    where user_id = v_driver_id and review_status = 'approved' and is_online and service_zone_id = v_order.zone_id
  ) then raise exception 'Driver is no longer eligible for this zone'; end if;
  update public.orders set status = 'accepted', driver_id = v_driver_id where id = v_order.id;
  update public.order_offers set status = 'accepted', responded_at = now() where id = v_offer.id;
  update public.order_offers set status = 'revoked', responded_at = now() where order_id = v_order.id and id <> v_offer.id and status = 'pending';
  return v_order.id;
end;
$$;
revoke all on function public.accept_order_offer(uuid) from public, anon;
grant execute on function public.accept_order_offer(uuid) to authenticated;
