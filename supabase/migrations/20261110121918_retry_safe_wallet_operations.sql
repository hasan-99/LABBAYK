create or replace function private.top_up_driver_wallet(p_driver_id uuid,p_amount_minor bigint,p_reason text,p_idempotency_key uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_amount bigint; v_reason text;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_amount_minor is null or p_amount_minor not between 1 and 100000000 then raise exception 'Invalid cash top-up amount'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 5 and 500 then raise exception 'A reason is required'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key is required'; end if;
  perform 1 from public.driver_profiles where user_id=p_driver_id and review_status='approved' for update;
  if not found then raise exception 'Approved driver not found'; end if;
  select amount_minor,reason into v_amount,v_reason from public.driver_wallet_ledger
    where driver_id=p_driver_id and idempotency_key=p_idempotency_key;
  if found then
    if v_amount<>p_amount_minor or v_reason<>trim(p_reason) then raise exception 'Idempotency key was already used for different top-up details'; end if;
    return (select coalesce(sum(amount_minor),0) from public.driver_wallet_ledger where driver_id=p_driver_id);
  end if;
  insert into public.driver_wallet_ledger(driver_id,amount_minor,entry_type,idempotency_key,reason,actor_id)
    values(p_driver_id,p_amount_minor,'cash_top_up',p_idempotency_key,trim(p_reason),auth.uid());
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,reason,after_data)
    values(auth.uid(),'top_up_driver_wallet','driver_wallet',p_driver_id::text,trim(p_reason),jsonb_build_object('amount_minor',p_amount_minor,'idempotency_key',p_idempotency_key));
  return (select coalesce(sum(amount_minor),0) from public.driver_wallet_ledger where driver_id=p_driver_id);
end;
$$;

create or replace function private.settle_cash_order(p_order_id uuid,p_idempotency_key uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_order public.orders%rowtype; v_balance bigint; v_commission bigint;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key is required'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status='settled' then
    if not exists(select 1 from public.cash_settlements where order_id=p_order_id) then raise exception 'Settled order is missing its cash reconciliation'; end if;
    return (select coalesce(sum(amount_minor),0) from public.driver_wallet_ledger where driver_id=v_order.driver_id);
  end if;
  if v_order.status<>'delivered' or v_order.purchase_amount_minor is null or v_order.driver_id is null then raise exception 'Only a delivered order with recorded purchase cost can be settled'; end if;
  if v_order.commission_rate_basis_points is null then raise exception 'Commission policy was not snapshotted for this order'; end if;
  if exists(select 1 from public.cash_settlements where order_id=p_order_id) then raise exception 'Order has already been settled'; end if;
  perform 1 from public.driver_profiles where user_id=v_order.driver_id for update;
  if not found then raise exception 'Driver wallet not found'; end if;
  select coalesce(sum(amount_minor),0) into v_balance from public.driver_wallet_ledger where driver_id=v_order.driver_id;
  v_commission:=floor(v_order.delivery_fee_minor*v_order.commission_rate_basis_points/10000.0+0.5)::bigint;
  if v_balance<v_commission then raise exception 'Driver wallet balance is insufficient for this commission'; end if;
  insert into public.cash_settlements(order_id,driver_id,idempotency_key,purchase_amount_minor,delivery_fee_minor,
      commission_rate_basis_points,commission_amount_minor,driver_earning_minor,cash_collected_minor,settled_by)
    values(p_order_id,v_order.driver_id,p_idempotency_key,v_order.purchase_amount_minor,v_order.delivery_fee_minor,
      v_order.commission_rate_basis_points,v_commission,v_order.delivery_fee_minor-v_commission,
      v_order.purchase_amount_minor+v_order.delivery_fee_minor,v_actor);
  if v_commission>0 then
    insert into public.driver_wallet_ledger(driver_id,amount_minor,entry_type,idempotency_key,order_id,reason,actor_id)
      values(v_order.driver_id,-v_commission,'delivery_commission',p_order_id,p_order_id,
        'عمولة توصيل الطلب '||left(p_order_id::text,8),v_actor);
  end if;
  update public.orders set status='settled' where id=p_order_id;
  insert into public.order_events(order_id,actor_id,event_type,details)
    values(p_order_id,v_actor,'cash_settled',jsonb_build_object('purchase_amount_minor',v_order.purchase_amount_minor,
      'delivery_fee_minor',v_order.delivery_fee_minor,'commission_minor',v_commission,
      'driver_earning_minor',v_order.delivery_fee_minor-v_commission));
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,reason,before_data,after_data)
    values(v_actor,'settle_cash_order','order',p_order_id::text,'تسوية نقدية بعد التحقق من استلام المبلغ من السائق',
      jsonb_build_object('status','delivered'),jsonb_build_object('status','settled','cash_collected_minor',v_order.purchase_amount_minor+v_order.delivery_fee_minor,
      'commission_minor',v_commission,'idempotency_key',p_idempotency_key));
  return v_balance-v_commission;
end;
$$;

create function private.get_driver_wallet_balances()
returns table(driver_id uuid,balance_minor bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.is_admin() and not exists(select 1 from public.driver_profiles where user_id=auth.uid()) then raise exception 'Driver access required'; end if;
  return query select dp.user_id,coalesce(sum(l.amount_minor),0)::bigint
    from public.driver_profiles dp left join public.driver_wallet_ledger l on l.driver_id=dp.user_id
    where private.is_admin() or dp.user_id=auth.uid() group by dp.user_id;
end;
$$;
revoke all on function private.get_driver_wallet_balances() from public,anon;
grant execute on function private.get_driver_wallet_balances() to authenticated;
create function public.get_driver_wallet_balances()
returns table(driver_id uuid,balance_minor bigint)
language sql security invoker set search_path = '' as $$ select * from private.get_driver_wallet_balances(); $$;
revoke all on function public.get_driver_wallet_balances() from public,anon;
grant execute on function public.get_driver_wallet_balances() to authenticated;
