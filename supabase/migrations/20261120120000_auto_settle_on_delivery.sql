-- The driver's recorded cash amount is final: delivery now settles the order automatically
-- (no admin confirmation step), and the settlement keeps the cash actually collected
-- (which can exceed purchase + fee when the customer adds a tip).

do $$
declare c text;
begin
  for c in select conname from pg_constraint
    where conrelid = 'public.cash_settlements'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%cash_collected_minor%=%purchase_amount_minor%'
  loop execute format('alter table public.cash_settlements drop constraint %I', c); end loop;
end $$;

-- Correct earlier settlements to the amount the driver actually recorded.
update public.cash_settlements s set cash_collected_minor = o.cash_collected_minor
from public.orders o
where o.id = s.order_id and o.cash_collected_minor is not null and o.cash_collected_minor <> s.cash_collected_minor;

create or replace function private.settle_order_cash(p_order_id uuid, p_idempotency_key uuid, p_actor uuid)
returns bigint language plpgsql security definer set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_balance bigint;
  v_commission bigint;
  v_collected bigint;
  v_settlement_id bigint;
  v_existing public.cash_settlements%rowtype;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  select * into v_existing from public.cash_settlements where idempotency_key=p_idempotency_key;
  if found then
    if v_existing.order_id<>p_order_id then raise exception 'Idempotency key was used for another order'; end if;
    return (select coalesce(sum(amount_minor),0) from public.driver_wallet_ledger where driver_id=v_existing.driver_id);
  end if;
  if v_order.status='settled' then
    if not exists(select 1 from public.cash_settlements s where s.order_id=p_order_id
      and not exists(select 1 from public.cash_settlement_reversals r where r.settlement_id=s.id))
    then raise exception 'Settled order is missing its active cash reconciliation'; end if;
    return (select coalesce(sum(amount_minor),0) from public.driver_wallet_ledger where driver_id=v_order.driver_id);
  end if;
  if v_order.status<>'delivered' or v_order.purchase_amount_minor is null or v_order.driver_id is null then
    raise exception 'Only a delivered order with recorded purchase cost can be settled';
  end if;
  if v_order.commission_rate_basis_points is null then raise exception 'Commission policy was not snapshotted for this order'; end if;
  if exists(select 1 from public.cash_settlements s where s.order_id=p_order_id
    and not exists(select 1 from public.cash_settlement_reversals r where r.settlement_id=s.id))
  then raise exception 'Order already has an active settlement'; end if;
  perform 1 from public.driver_profiles where user_id=v_order.driver_id for update;
  if not found then raise exception 'Driver wallet not found'; end if;
  select coalesce(sum(amount_minor),0) into v_balance from public.driver_wallet_ledger where driver_id=v_order.driver_id;
  v_commission:=floor(v_order.delivery_fee_minor*v_order.commission_rate_basis_points/10000.0+0.5)::bigint;
  v_collected:=coalesce(v_order.cash_collected_minor, v_order.purchase_amount_minor+v_order.delivery_fee_minor);
  insert into public.cash_settlements(order_id,driver_id,idempotency_key,purchase_amount_minor,delivery_fee_minor,
      commission_rate_basis_points,commission_amount_minor,driver_earning_minor,cash_collected_minor,settled_by)
    values(p_order_id,v_order.driver_id,p_idempotency_key,v_order.purchase_amount_minor,v_order.delivery_fee_minor,
      v_order.commission_rate_basis_points,v_commission,v_order.delivery_fee_minor-v_commission,v_collected,p_actor)
    returning id into v_settlement_id;
  if v_commission>0 then
    insert into public.driver_wallet_ledger(driver_id,amount_minor,entry_type,idempotency_key,order_id,settlement_id,reason,actor_id)
      values(v_order.driver_id,-v_commission,'delivery_commission',p_idempotency_key,p_order_id,v_settlement_id,
        'عمولة توصيل مستحقة عن الطلب '||left(p_order_id::text,8),p_actor);
  end if;
  update public.orders set status='settled' where id=p_order_id;
  insert into public.order_events(order_id,actor_id,event_type,details)
    values(p_order_id,p_actor,'cash_settled',jsonb_build_object('settlement_id',v_settlement_id,
      'purchase_amount_minor',v_order.purchase_amount_minor,'delivery_fee_minor',v_order.delivery_fee_minor,
      'cash_collected_minor',v_collected,'commission_minor',v_commission,
      'commission_collection','driver_pays_admin_after_delivery',
      'commission_due_after_settlement',greatest(0,-(v_balance-v_commission)),
      'driver_earning_minor',v_order.delivery_fee_minor-v_commission));
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,reason,before_data,after_data)
    values(p_actor,'settle_cash_order','order',p_order_id::text,'تسوية تلقائية عند تسليم الطلب',
      jsonb_build_object('status','delivered'),jsonb_build_object('status','settled','settlement_id',v_settlement_id,
        'customer_cash_collected_minor',v_collected,'commission_minor',v_commission,
        'driver_earning_minor',v_order.delivery_fee_minor-v_commission,'idempotency_key',p_idempotency_key));
  return v_balance-v_commission;
end;
$$;
revoke all on function private.settle_order_cash(uuid,uuid,uuid) from public, anon, authenticated;

-- Admin confirmation stays only for orders delivered before this change.
create or replace function private.settle_cash_order(p_order_id uuid,p_idempotency_key uuid)
returns bigint language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key is required'; end if;
  return private.settle_order_cash(p_order_id, p_idempotency_key, auth.uid());
end;
$$;
revoke all on function private.settle_cash_order(uuid,uuid) from public, anon;
grant execute on function private.settle_cash_order(uuid,uuid) to authenticated;

create or replace function private.confirm_order_delivery_with_photo(p_order_id uuid, p_proof_path text, p_cash_collected_minor bigint default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_order public.orders%rowtype;
begin
  if p_cash_collected_minor is not null and p_cash_collected_minor not between 0 and 100000000 then
    raise exception 'Invalid collected amount';
  end if;
  select * into v_order from public.orders where id = p_order_id and driver_id = v_actor for update;
  if not found then raise exception 'Assigned order not found'; end if;
  if not exists (select 1 from public.driver_profiles where user_id = v_actor and review_status = 'approved') then
    raise exception 'Approved driver required';
  end if;
  if v_order.status <> 'delivering' then raise exception 'Order is not out for delivery'; end if;
  if p_proof_path is null or p_proof_path !~ ('^' || p_order_id::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'Invalid delivery photo path';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'delivery-proofs' and name = p_proof_path) then
    raise exception 'Delivery photo is missing';
  end if;
  update public.orders
    set status = 'delivered', delivered_at = now(), delivery_proof_path = p_proof_path,
        cash_collected_minor = p_cash_collected_minor,
        delivery_code_hash = null, delivery_code_expires_at = null
    where id = p_order_id;
  insert into public.order_events(order_id, actor_id, event_type, details)
  values (p_order_id, v_actor, 'delivery_confirmed',
    jsonb_build_object('purchase_amount_minor', v_order.purchase_amount_minor,
      'delivery_fee_minor', v_order.delivery_fee_minor, 'proof_path', p_proof_path,
      'cash_collected_minor', p_cash_collected_minor));
  if v_order.purchase_amount_minor is not null and v_order.commission_rate_basis_points is not null then
    perform private.settle_order_cash(p_order_id, gen_random_uuid(), v_actor);
  end if;
end;
$$;
revoke all on function private.confirm_order_delivery_with_photo(uuid, text, bigint) from public, anon;
grant execute on function private.confirm_order_delivery_with_photo(uuid, text, bigint) to authenticated;
