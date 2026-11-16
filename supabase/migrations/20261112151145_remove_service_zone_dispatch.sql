-- Customer delivery is served across Damascus and Rif Dimashq. Keep the old
-- zone tables/keys for historical records, but stop requiring them for new work.
alter table public.orders alter column zone_id drop not null;

create or replace function private.validate_address_zone()
returns trigger language plpgsql set search_path = ''
as $$
declare v_governorate text := lower(btrim(new.governorate));
begin
  if v_governorate not in (
    'دمشق', 'محافظة دمشق', 'damascus',
    'ريف دمشق', 'محافظة ريف دمشق', 'rif dimashq', 'rif dimashq governorate'
  ) then
    raise exception 'Delivery is currently available only in Damascus and Rif Dimashq'
      using errcode = '23514';
  end if;

  -- Zone IDs no longer determine customer coverage or driver assignment.
  new.zone_id := null;
  return new;
end;
$$;

create or replace function private.create_customer_order(
  p_idempotency_key uuid,
  p_address_id uuid,
  p_category text,
  p_request_text text,
  p_budget_ceiling_minor bigint
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_customer_id uuid := auth.uid();
  v_address public.addresses%rowtype;
  v_governorate text;
  v_order_id uuid;
begin
  if v_customer_id is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null then raise exception 'Request key is required'; end if;
  if p_category is null or char_length(trim(p_category)) not between 1 and 80 then raise exception 'Invalid category'; end if;
  if p_request_text is null or char_length(trim(p_request_text)) not between 1 and 4000 then raise exception 'Invalid request'; end if;
  if p_budget_ceiling_minor is null or p_budget_ceiling_minor not between 1 and 100000000 then raise exception 'A valid purchase budget is required'; end if;

  select * into v_address from public.addresses where id = p_address_id and user_id = v_customer_id;
  if not found then raise exception 'Address not found'; end if;
  v_governorate := lower(btrim(v_address.governorate));
  if v_governorate not in (
    'دمشق', 'محافظة دمشق', 'damascus',
    'ريف دمشق', 'محافظة ريف دمشق', 'rif dimashq', 'rif dimashq governorate'
  ) then
    raise exception 'Delivery is currently available only in Damascus and Rif Dimashq';
  end if;

  insert into public.orders (
    customer_id,address_id,zone_id,idempotency_key,category,request_text,delivery_fee_minor,
    budget_ceiling_minor,base_fee_minor,zone_surcharge_minor,pricing_rule_version
  ) values (
    v_customer_id,v_address.id,null,p_idempotency_key,trim(p_category),trim(p_request_text),0,
    p_budget_ceiling_minor,0,0,0
  )
  on conflict (customer_id,idempotency_key) do nothing returning id into v_order_id;

  if v_order_id is null then
    select id into v_order_id from public.orders
    where customer_id = v_customer_id and idempotency_key = p_idempotency_key
      and address_id = v_address.id and category = trim(p_category)
      and request_text = trim(p_request_text) and budget_ceiling_minor = p_budget_ceiling_minor;
    if v_order_id is null then raise exception 'Idempotency key reused with different order data'; end if;
  else
    insert into public.order_events(order_id,actor_id,event_type,details)
    values (v_order_id,v_customer_id,'order_requested',jsonb_build_object(
      'budget_ceiling_minor',p_budget_ceiling_minor,
      'delivery_quote_status','pending',
      'pricing_mode','manual_road_distance',
      'service_area','Damascus and Rif Dimashq'
    ));
  end if;
  return v_order_id;
end;
$$;

create or replace function private.dispatch_order(p_order_id uuid)
returns integer language plpgsql security definer set search_path = ''
as $$
declare v_order public.orders%rowtype; v_count integer; v_rate integer; v_version integer;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  select rate_basis_points,version into v_rate,v_version from public.commission_policies where id=1;
  if not found then raise exception 'Set the commission policy before dispatching orders'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status not in ('requested','searching') or v_order.driver_id is not null then raise exception 'Order is not ready for dispatch'; end if;
  if v_order.delivery_quote_set_at is null or v_order.delivery_quote_approved_at is null then
    raise exception 'Customer approval of the delivery quote is required';
  end if;
  if v_order.commission_rate_basis_points is null then
    update public.orders set commission_rate_basis_points=v_rate,commission_policy_version=v_version where id=v_order.id
      returning * into v_order;
  end if;
  update public.order_offers set status='expired',responded_at=now() where order_id=v_order.id and status='pending';
  select count(*) into v_count
  from public.driver_profiles dp
  join public.user_roles ur on ur.user_id=dp.user_id and ur.role='driver'
  where dp.review_status='approved' and dp.is_online
    and coalesce((select sum(l.amount_minor) from public.driver_wallet_ledger l where l.driver_id=dp.user_id),0)
      >= floor(v_order.delivery_fee_minor*v_order.commission_rate_basis_points/10000.0+0.5)::bigint;
  if v_count=0 then raise exception 'No online approved drivers with enough wallet balance'; end if;
  insert into public.order_offers(order_id,driver_id,expires_at)
    select v_order.id,dp.user_id,now()+interval '90 seconds'
    from public.driver_profiles dp
    join public.user_roles ur on ur.user_id=dp.user_id and ur.role='driver'
    where dp.review_status='approved' and dp.is_online
      and coalesce((select sum(l.amount_minor) from public.driver_wallet_ledger l where l.driver_id=dp.user_id),0)
        >= floor(v_order.delivery_fee_minor*v_order.commission_rate_basis_points/10000.0+0.5)::bigint
    on conflict(order_id,driver_id) do update set status='pending',expires_at=excluded.expires_at,created_at=now(),responded_at=null
      where public.order_offers.status<>'accepted';
  update public.orders set status='searching' where id=v_order.id;
  insert into public.order_events(order_id,actor_id,event_type,details)
    values(v_order.id,auth.uid(),'offers_dispatched',jsonb_build_object(
      'eligible_driver_count',v_count,
      'commission_rate_basis_points',v_order.commission_rate_basis_points,
      'dispatch_mode','all_available_drivers'
    ));
  return v_count;
end;
$$;

revoke all on function private.create_customer_order(uuid,uuid,text,text,bigint) from public,anon;
grant execute on function private.create_customer_order(uuid,uuid,text,text,bigint) to authenticated;
revoke all on function private.dispatch_order(uuid) from public,anon;
grant execute on function private.dispatch_order(uuid) to authenticated;
