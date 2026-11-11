create or replace function private.create_customer_order(
  p_idempotency_key uuid,p_address_id uuid,p_category text,p_request_text text,p_budget_ceiling_minor bigint
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_customer_id uuid := auth.uid(); v_address public.addresses%rowtype; v_zone public.service_zones%rowtype;
  v_order_id uuid; v_base_fee bigint := 0; v_pricing_version integer := 0; v_total_fee bigint;
begin
  if v_customer_id is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null then raise exception 'Request key is required'; end if;
  if p_category is null or char_length(trim(p_category)) not between 1 and 80 then raise exception 'Invalid category'; end if;
  if p_request_text is null or char_length(trim(p_request_text)) not between 1 and 4000 then raise exception 'Invalid request'; end if;
  if p_budget_ceiling_minor is null or p_budget_ceiling_minor not between 1 and 100000000 then raise exception 'A valid purchase budget is required'; end if;

  select * into v_address from public.addresses where id=p_address_id and user_id=v_customer_id;
  if not found then raise exception 'Address not found'; end if;
  select * into v_zone from public.service_zones where id=v_address.zone_id and active;
  if not found then raise exception 'Delivery zone is inactive'; end if;
  select base_fee_minor,version into v_base_fee,v_pricing_version from public.global_delivery_pricing where id=1;
  if not found then
    if v_zone.delivery_surcharge_minor=0 then raise exception 'Delivery pricing is not configured'; end if;
    v_base_fee:=0; v_pricing_version:=0;
  end if;
  v_total_fee := v_base_fee + v_zone.delivery_surcharge_minor;
  if v_total_fee not between 0 and 100000000 then raise exception 'Calculated delivery fee is outside supported limits'; end if;

  insert into public.orders (customer_id,address_id,zone_id,idempotency_key,category,request_text,delivery_fee_minor,
    budget_ceiling_minor,base_fee_minor,zone_surcharge_minor,pricing_rule_version)
  values (v_customer_id,v_address.id,v_zone.id,p_idempotency_key,trim(p_category),trim(p_request_text),v_total_fee,
    p_budget_ceiling_minor,v_base_fee,v_zone.delivery_surcharge_minor,v_pricing_version)
  on conflict (customer_id,idempotency_key) do nothing returning id into v_order_id;
  if v_order_id is null then
    select id into v_order_id from public.orders where customer_id=v_customer_id and idempotency_key=p_idempotency_key
      and address_id=v_address.id and category=trim(p_category) and request_text=trim(p_request_text)
      and budget_ceiling_minor=p_budget_ceiling_minor;
    if v_order_id is null then raise exception 'Idempotency key reused with different order data'; end if;
  else
    insert into public.order_events(order_id,actor_id,event_type,details)
    values (v_order_id,v_customer_id,'order_requested',jsonb_build_object('budget_ceiling_minor',p_budget_ceiling_minor,
      'delivery_fee_minor',v_total_fee,'base_fee_minor',v_base_fee,'zone_surcharge_minor',v_zone.delivery_surcharge_minor,'pricing_rule_version',v_pricing_version));
  end if;
  return v_order_id;
end;
$$;
