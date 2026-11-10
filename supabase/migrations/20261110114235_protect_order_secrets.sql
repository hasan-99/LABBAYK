revoke select on public.orders from public,anon,authenticated;
grant select (
  id,customer_id,address_id,zone_id,category,request_text,status,delivery_fee_minor,currency,
  created_at,updated_at,driver_id,budget_ceiling_minor,purchase_amount_minor,purchased_at,delivered_at
) on public.orders to authenticated;

create or replace function private.issue_delivery_code(p_order_id uuid)
returns table(code text,expires_at timestamptz) language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_code text; v_random bigint; v_expires timestamptz;
begin
  perform 1 from public.orders where id=p_order_id and customer_id=v_actor and status='delivering' for update;
  if not found then raise exception 'Customer order is not being delivered'; end if;
  v_random := (('x'||encode(extensions.gen_random_bytes(4),'hex'))::bit(32)::bigint + 4294967296) % 4294967296;
  v_code := lpad((v_random % 100000000)::text,8,'0');
  v_expires := now() + interval '15 minutes';
  update public.orders set delivery_code_hash=extensions.crypt(v_code,extensions.gen_salt('bf',10)),
    delivery_code_expires_at=v_expires,delivery_code_attempts=0 where id=p_order_id;
  insert into public.order_events(order_id,actor_id,event_type) values (p_order_id,v_actor,'delivery_code_issued');
  return query select v_code,v_expires;
end;
$$;

create or replace function private.confirm_order_delivery(p_order_id uuid,p_code text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id=p_order_id and driver_id=v_actor for update;
  if not found then raise exception 'Assigned order not found'; end if;
  if not exists (select 1 from public.driver_profiles where user_id=v_actor and review_status='approved') then raise exception 'Approved driver required'; end if;
  if v_order.status <> 'delivering' or v_order.delivery_code_hash is null or v_order.delivery_code_expires_at <= now() then raise exception 'Delivery code is missing or expired'; end if;
  if v_order.delivery_code_attempts >= 5 then raise exception 'Delivery code attempt limit reached'; end if;
  if p_code is null or p_code !~ '^[0-9]{8}$' or extensions.crypt(p_code,v_order.delivery_code_hash) <> v_order.delivery_code_hash then
    update public.orders set delivery_code_attempts=delivery_code_attempts+1 where id=p_order_id;
    insert into public.order_events(order_id,actor_id,event_type) values (p_order_id,v_actor,'delivery_code_rejected');
    return false;
  end if;
  update public.orders set status='delivered',delivered_at=now(),delivery_code_hash=null,delivery_code_expires_at=null where id=p_order_id;
  insert into public.order_events(order_id,actor_id,event_type,details)
  values (p_order_id,v_actor,'delivery_confirmed',jsonb_build_object('purchase_amount_minor',v_order.purchase_amount_minor,'delivery_fee_minor',v_order.delivery_fee_minor));
  return true;
end;
$$;

revoke all on function private.issue_delivery_code(uuid) from public,anon;
revoke all on function private.confirm_order_delivery(uuid,text) from public,anon;
grant execute on function private.issue_delivery_code(uuid) to authenticated;
grant execute on function private.confirm_order_delivery(uuid,text) to authenticated;
