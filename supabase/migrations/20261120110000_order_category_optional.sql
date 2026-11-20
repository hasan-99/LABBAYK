-- Orders no longer have a category. Expand step: make the column optional and stop requiring it.
-- The 5-argument signature stays (ignoring p_category) so installed app builds keep working.
-- A later migration drops orders.category once no old build selects it.

alter table public.orders alter column category drop not null;

create or replace function private.create_customer_order(
  p_idempotency_key uuid,
  p_address_id uuid,
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
    customer_id,address_id,zone_id,idempotency_key,request_text,delivery_fee_minor,
    budget_ceiling_minor,base_fee_minor,zone_surcharge_minor,pricing_rule_version
  ) values (
    v_customer_id,v_address.id,null,p_idempotency_key,trim(p_request_text),0,
    p_budget_ceiling_minor,0,0,0
  )
  on conflict (customer_id,idempotency_key) do nothing returning id into v_order_id;

  if v_order_id is null then
    select id into v_order_id from public.orders
    where customer_id=v_customer_id and idempotency_key=p_idempotency_key
      and address_id=v_address.id
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
revoke all on function private.create_customer_order(uuid,uuid,text,bigint) from public,anon;
grant execute on function private.create_customer_order(uuid,uuid,text,bigint) to authenticated;

-- Legacy 5-argument version used by installed builds: category is ignored.
create or replace function private.create_customer_order(
  p_idempotency_key uuid,
  p_address_id uuid,
  p_category text,
  p_request_text text,
  p_budget_ceiling_minor bigint
) returns uuid
language sql security definer set search_path = ''
as $$ select private.create_customer_order($1,$2,$4,$5); $$;
revoke all on function private.create_customer_order(uuid,uuid,text,text,bigint) from public,anon;
grant execute on function private.create_customer_order(uuid,uuid,text,text,bigint) to authenticated;

create or replace function public.create_customer_order(
  p_idempotency_key uuid,p_address_id uuid,p_request_text text,p_budget_ceiling_minor bigint
) returns uuid language sql security invoker set search_path = ''
as $$ select private.create_customer_order($1,$2,$3,$4); $$;
revoke all on function public.create_customer_order(uuid,uuid,text,bigint) from public,anon;
grant execute on function public.create_customer_order(uuid,uuid,text,bigint) to authenticated;
