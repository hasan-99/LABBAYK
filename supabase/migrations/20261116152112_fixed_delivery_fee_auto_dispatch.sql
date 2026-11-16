create or replace function private.dispatch_customer_order(p_order_id uuid)
returns integer language plpgsql security definer set search_path = ''
as $$
declare v_order public.orders%rowtype; v_count integer; v_rate integer; v_version integer;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status <> 'requested' or v_order.driver_id is not null then
    raise exception 'New customer order is not ready for dispatch';
  end if;
  if v_order.delivery_fee_minor <> 30000 then raise exception 'Order does not have the fixed delivery fee'; end if;

  select rate_basis_points,version into v_rate,v_version from public.commission_policies where id=1;
  if not found then raise exception 'Commission policy is not configured'; end if;
  update public.orders
    set status='searching',commission_rate_basis_points=v_rate,commission_policy_version=v_version
    where id=v_order.id;

  select count(*) into v_count
  from public.driver_profiles dp
  join public.user_roles ur on ur.user_id=dp.user_id and ur.role='driver'
  where dp.review_status='approved' and dp.is_online;

  insert into public.order_offers(order_id,driver_id,expires_at)
    select v_order.id,dp.user_id,now()+interval '90 seconds'
    from public.driver_profiles dp
    join public.user_roles ur on ur.user_id=dp.user_id and ur.role='driver'
    where dp.review_status='approved' and dp.is_online
    on conflict (order_id,driver_id) do nothing;

  insert into public.order_events(order_id,actor_id,event_type,details)
    values(v_order.id,null,'offers_dispatched',jsonb_build_object(
      'eligible_driver_count',v_count,
      'commission_rate_basis_points',v_rate,
      'dispatch_mode','all_available_drivers',
      'commission_collection','after_delivery'
    ));
  return v_count;
end;
$$;

revoke all on function private.dispatch_customer_order(uuid) from public,anon,authenticated;

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

  select * into v_address from public.addresses where id=p_address_id and user_id=v_customer_id;
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
    v_customer_id,v_address.id,null,p_idempotency_key,trim(p_category),trim(p_request_text),30000,
    p_budget_ceiling_minor,30000,0,0
  )
  on conflict (customer_id,idempotency_key) do nothing returning id into v_order_id;

  if v_order_id is null then
    select id into v_order_id from public.orders
    where customer_id=v_customer_id and idempotency_key=p_idempotency_key
      and address_id=v_address.id and category=trim(p_category)
      and request_text=trim(p_request_text) and budget_ceiling_minor=p_budget_ceiling_minor;
    if v_order_id is null then raise exception 'Idempotency key reused with different order data'; end if;
  else
    insert into public.order_events(order_id,actor_id,event_type,details)
      values(v_order_id,v_customer_id,'order_requested',jsonb_build_object(
        'budget_ceiling_minor',p_budget_ceiling_minor,
        'delivery_fee_minor',30000,
        'pricing_mode','fixed'
      ));
    perform private.dispatch_customer_order(v_order_id);
  end if;
  return v_order_id;
end;
$$;
