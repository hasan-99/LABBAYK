-- Driver commission is payable after completed cash orders; it is not a
-- precondition for receiving or accepting an offer.
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
  where dp.review_status='approved' and dp.is_online;
  if v_count=0 then raise exception 'No online approved drivers'; end if;
  insert into public.order_offers(order_id,driver_id,expires_at)
    select v_order.id,dp.user_id,now()+interval '90 seconds'
    from public.driver_profiles dp
    join public.user_roles ur on ur.user_id=dp.user_id and ur.role='driver'
    where dp.review_status='approved' and dp.is_online
    on conflict(order_id,driver_id) do update set status='pending',expires_at=excluded.expires_at,created_at=now(),responded_at=null
      where public.order_offers.status<>'accepted';
  update public.orders set status='searching' where id=v_order.id;
  insert into public.order_events(order_id,actor_id,event_type,details)
    values(v_order.id,auth.uid(),'offers_dispatched',jsonb_build_object(
      'eligible_driver_count',v_count,
      'commission_rate_basis_points',v_order.commission_rate_basis_points,
      'dispatch_mode','all_available_drivers',
      'commission_collection','after_delivery'
    ));
  return v_count;
end;
$$;

create or replace function private.accept_order_offer(p_offer_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_driver_id uuid:=auth.uid(); v_offer public.order_offers%rowtype; v_order public.orders%rowtype;
begin
  if v_driver_id is null then raise exception 'Authentication required'; end if;
  perform 1 from public.driver_profiles dp join public.user_roles ur on ur.user_id=dp.user_id
    where dp.user_id=v_driver_id and ur.role='driver' and dp.review_status='approved' and dp.is_online for update of dp;
  if not found then raise exception 'Approved online driver access required'; end if;
  select * into v_offer from public.order_offers where id=p_offer_id and driver_id=v_driver_id and status='pending' and expires_at>now() for update;
  if not found then raise exception 'Offer expired or unavailable'; end if;
  select * into v_order from public.orders where id=v_offer.order_id for update;
  if not found or v_order.status<>'searching' or v_order.driver_id is not null then raise exception 'Another driver already accepted this order'; end if;
  update public.orders set status='accepted',driver_id=v_driver_id where id=v_order.id;
  update public.order_offers set status='accepted',responded_at=now() where id=v_offer.id;
  update public.order_offers set status='revoked',responded_at=now() where order_id=v_order.id and id<>v_offer.id and status='pending';
  insert into public.order_events(order_id,actor_id,event_type) values(v_order.id,v_driver_id,'driver_accepted');
  return v_order.id;
end;
$$;

create or replace function private.settle_cash_order(p_order_id uuid,p_idempotency_key uuid)
returns bigint language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid:=auth.uid();
  v_order public.orders%rowtype;
  v_balance bigint;
  v_commission bigint;
  v_settlement_id bigint;
  v_existing public.cash_settlements%rowtype;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key is required'; end if;
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
  insert into public.cash_settlements(order_id,driver_id,idempotency_key,purchase_amount_minor,delivery_fee_minor,
      commission_rate_basis_points,commission_amount_minor,driver_earning_minor,cash_collected_minor,settled_by)
    values(p_order_id,v_order.driver_id,p_idempotency_key,v_order.purchase_amount_minor,v_order.delivery_fee_minor,
      v_order.commission_rate_basis_points,v_commission,v_order.delivery_fee_minor-v_commission,
      v_order.purchase_amount_minor+v_order.delivery_fee_minor,v_actor)
    returning id into v_settlement_id;
  if v_commission>0 then
    insert into public.driver_wallet_ledger(driver_id,amount_minor,entry_type,idempotency_key,order_id,settlement_id,reason,actor_id)
      values(v_order.driver_id,-v_commission,'delivery_commission',p_idempotency_key,p_order_id,v_settlement_id,
        'عمولة توصيل مستحقة عن الطلب '||left(p_order_id::text,8),v_actor);
  end if;
  update public.orders set status='settled' where id=p_order_id;
  insert into public.order_events(order_id,actor_id,event_type,details)
    values(p_order_id,v_actor,'cash_settled',jsonb_build_object('settlement_id',v_settlement_id,
      'purchase_amount_minor',v_order.purchase_amount_minor,'delivery_fee_minor',v_order.delivery_fee_minor,
      'commission_minor',v_commission,'commission_collection','driver_pays_admin_after_delivery',
      'commission_due_after_settlement',greatest(0,-(v_balance-v_commission)),
      'driver_earning_minor',v_order.delivery_fee_minor-v_commission));
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,reason,before_data,after_data)
    values(v_actor,'settle_cash_order','order',p_order_id::text,'تأكيد تحصيل الزبون وحساب عمولة التوصيل المستحقة',
      jsonb_build_object('status','delivered'),jsonb_build_object('status','settled','settlement_id',v_settlement_id,
        'customer_cash_collected_minor',v_order.purchase_amount_minor+v_order.delivery_fee_minor,
        'commission_minor',v_commission,'driver_earning_minor',v_order.delivery_fee_minor-v_commission,
        'idempotency_key',p_idempotency_key));
  return v_balance-v_commission;
end;
$$;

revoke all on function private.dispatch_order(uuid) from public,anon;
grant execute on function private.dispatch_order(uuid) to authenticated;
revoke all on function private.accept_order_offer(uuid) from public,anon;
grant execute on function private.accept_order_offer(uuid) to authenticated;
revoke all on function private.settle_cash_order(uuid,uuid) from public,anon;
grant execute on function private.settle_cash_order(uuid,uuid) to authenticated;
