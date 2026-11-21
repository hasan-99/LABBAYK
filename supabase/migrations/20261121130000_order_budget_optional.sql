-- The customer no longer enters a purchase budget. Purchase approval was already removed
-- (20261116231737), so the budget only informed the driver. Expand step: the column becomes
-- optional and a new create_customer_order takes no budget. The old 4- and 5-argument versions
-- stay so installed app builds keep working; the column is dropped in a later contract step.

alter table public.orders alter column budget_ceiling_minor drop not null;
alter table public.orders alter column budget_ceiling_minor drop default;

create or replace function private.create_customer_order(
  p_idempotency_key uuid,
  p_address_id uuid,
  p_request_text text,
  p_is_urgent boolean
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
  if p_request_text is null or char_length(trim(p_request_text)) not between 1 and 4000 then raise exception 'Invalid request'; end if;

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
    customer_id,address_id,zone_id,idempotency_key,request_text,delivery_fee_minor,
    base_fee_minor,zone_surcharge_minor,pricing_rule_version,is_urgent
  ) values (
    v_customer_id,v_address.id,null,p_idempotency_key,trim(p_request_text),0,
    0,0,0,coalesce(p_is_urgent,false)
  )
  on conflict (customer_id,idempotency_key) do nothing returning id into v_order_id;

  if v_order_id is null then
    select id into v_order_id from public.orders
    where customer_id=v_customer_id and idempotency_key=p_idempotency_key
      and address_id=v_address.id and request_text=trim(p_request_text);
    if v_order_id is null then raise exception 'Idempotency key reused with different order data'; end if;
  else
    insert into public.order_events(order_id,actor_id,event_type,details)
      values(v_order_id,v_customer_id,'order_requested',jsonb_build_object(
        'delivery_quote_status','pending',
        'pricing_mode','admin_set',
        'is_urgent',coalesce(p_is_urgent,false)
      ));
  end if;
  return v_order_id;
end;
$$;
revoke all on function private.create_customer_order(uuid,uuid,text,boolean) from public,anon;
grant execute on function private.create_customer_order(uuid,uuid,text,boolean) to authenticated;

create or replace function public.create_customer_order(
  p_idempotency_key uuid,p_address_id uuid,p_request_text text,p_is_urgent boolean default false
) returns uuid language sql security invoker set search_path = ''
as $$ select private.create_customer_order($1,$2,$3,$4); $$;
revoke all on function public.create_customer_order(uuid,uuid,text,boolean) from public,anon;
grant execute on function public.create_customer_order(uuid,uuid,text,boolean) to authenticated;
