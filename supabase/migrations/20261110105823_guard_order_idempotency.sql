create or replace function public.create_customer_order(
  p_idempotency_key uuid,
  p_address_id uuid,
  p_category text,
  p_request_text text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid := auth.uid();
  v_address public.addresses%rowtype;
  v_zone public.service_zones%rowtype;
  v_order_id uuid;
begin
  if v_customer_id is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null then raise exception 'Request key is required'; end if;
  if p_category is null or char_length(trim(p_category)) not between 1 and 80 then raise exception 'Invalid category'; end if;
  if p_request_text is null or char_length(trim(p_request_text)) not between 1 and 4000 then raise exception 'Invalid request'; end if;

  select * into v_address from public.addresses where id = p_address_id and user_id = v_customer_id;
  if not found then raise exception 'Address not found'; end if;
  select * into v_zone from public.service_zones where id = v_address.zone_id and active;
  if not found then raise exception 'Delivery zone is inactive'; end if;

  insert into public.orders (customer_id, address_id, zone_id, idempotency_key, category, request_text, delivery_fee_minor)
  values (v_customer_id, v_address.id, v_zone.id, p_idempotency_key, trim(p_category), trim(p_request_text), v_zone.delivery_surcharge_minor)
  on conflict (customer_id, idempotency_key) do nothing
  returning id into v_order_id;

  if v_order_id is null then
    select id into v_order_id from public.orders
    where customer_id = v_customer_id and idempotency_key = p_idempotency_key
      and address_id = v_address.id and category = trim(p_category) and request_text = trim(p_request_text);
    if v_order_id is null then raise exception 'Idempotency key reused with different order data'; end if;
  end if;
  return v_order_id;
end;
$$;
revoke all on function public.create_customer_order(uuid, uuid, text, text) from public, anon;
grant execute on function public.create_customer_order(uuid, uuid, text, text) to authenticated;
