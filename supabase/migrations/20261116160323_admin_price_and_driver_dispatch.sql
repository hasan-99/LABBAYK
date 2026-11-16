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
    v_customer_id,v_address.id,null,p_idempotency_key,trim(p_category),trim(p_request_text),0,
    p_budget_ceiling_minor,0,0,0
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
        'delivery_quote_status','pending',
        'pricing_mode','admin_set'
      ));
  end if;
  return v_order_id;
end;
$$;

create or replace function private.admin_price_and_dispatch_order(
  p_order_id uuid,
  p_fee_minor bigint,
  p_driver_id uuid,
  p_reason text
) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_rate integer;
  v_version integer;
  v_count integer := 0;
  v_previous_fee bigint;
  v_previous_status text;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_fee_minor is null or p_fee_minor not between 0 and 100000000 then raise exception 'Invalid delivery quote'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 5 and 500 then raise exception 'A reason is required'; end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status not in ('requested','quoted','searching') or v_order.driver_id is not null then
    raise exception 'Order is not ready for pricing or dispatch';
  end if;
  select rate_basis_points,version into v_rate,v_version from public.commission_policies where id=1;
  if not found then raise exception 'Set the commission policy before dispatching orders'; end if;

  update public.order_offers set status='expired',responded_at=now()
    where order_id=p_order_id and status='pending';
  v_previous_fee := v_order.delivery_fee_minor;
  v_previous_status := v_order.status;
  update public.orders set delivery_fee_minor=p_fee_minor,base_fee_minor=0,zone_surcharge_minor=0,
    pricing_rule_version=0,delivery_quote_set_at=now(),delivery_quote_set_by=v_actor,
    commission_rate_basis_points=coalesce(commission_rate_basis_points,v_rate),
    commission_policy_version=coalesce(commission_policy_version,v_version),status='quoted'
    where id=p_order_id returning * into v_order;

  insert into public.order_events(order_id,actor_id,event_type,details)
    values(p_order_id,v_actor,'delivery_quote_set',jsonb_build_object(
      'delivery_fee_minor',p_fee_minor,'reason',trim(p_reason),'customer_approval_required',false
    ));
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,reason,before_data,after_data)
    values(v_actor,'set_order_delivery_quote','order',p_order_id::text,trim(p_reason),
      jsonb_build_object('delivery_fee_minor',v_previous_fee,'status',v_previous_status),
      jsonb_build_object('delivery_fee_minor',p_fee_minor,'dispatch_driver_id',p_driver_id));

  if p_driver_id is not null then
    if not exists (
      select 1 from public.driver_profiles dp
      join public.user_roles ur on ur.user_id=dp.user_id and ur.role='driver'
      where dp.user_id=p_driver_id and dp.review_status='approved' and dp.is_online
    ) then raise exception 'Selected driver is not available'; end if;
    update public.orders set status='assigned',driver_id=p_driver_id where id=p_order_id;
    insert into public.order_events(order_id,actor_id,event_type,details)
      values(p_order_id,v_actor,'driver_assigned',jsonb_build_object('driver_id',p_driver_id,'delivery_fee_minor',p_fee_minor,'assignment_mode','admin_direct'));
    insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,reason,before_data,after_data)
      values(v_actor,'assign_order_to_driver','order',p_order_id::text,trim(p_reason),
        jsonb_build_object('status','quoted'),jsonb_build_object('status','assigned','driver_id',p_driver_id));
    return 1;
  end if;

  select count(*) into v_count
  from public.driver_profiles dp
  join public.user_roles ur on ur.user_id=dp.user_id and ur.role='driver'
  where dp.review_status='approved' and dp.is_online;
  if v_count=0 then return 0; end if;

  insert into public.order_offers(order_id,driver_id,expires_at)
    select p_order_id,dp.user_id,now()+interval '90 seconds'
    from public.driver_profiles dp
    join public.user_roles ur on ur.user_id=dp.user_id and ur.role='driver'
    where dp.review_status='approved' and dp.is_online
    on conflict(order_id,driver_id) do update set status='pending',expires_at=excluded.expires_at,created_at=now(),responded_at=null
      where public.order_offers.status<>'accepted';
  update public.orders set status='searching' where id=p_order_id;
  insert into public.order_events(order_id,actor_id,event_type,details)
    values(p_order_id,v_actor,'offers_dispatched',jsonb_build_object(
      'eligible_driver_count',v_count,'commission_rate_basis_points',v_order.commission_rate_basis_points,
      'dispatch_mode','all_available_drivers','first_accept_wins',true
    ));
  return v_count;
end;
$$;

revoke all on function private.admin_price_and_dispatch_order(uuid,bigint,uuid,text) from public,anon;
grant execute on function private.admin_price_and_dispatch_order(uuid,bigint,uuid,text) to authenticated;

create or replace function public.admin_price_and_dispatch_order(
  p_order_id uuid,p_fee_minor bigint,p_driver_id uuid,p_reason text
) returns integer language sql security invoker set search_path = '' as $$
  select private.admin_price_and_dispatch_order($1,$2,$3,$4);
$$;
revoke all on function public.admin_price_and_dispatch_order(uuid,bigint,uuid,text) from public,anon;
grant execute on function public.admin_price_and_dispatch_order(uuid,bigint,uuid,text) to authenticated;
