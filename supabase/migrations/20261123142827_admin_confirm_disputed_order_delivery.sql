-- Let an administrator finish a disputed delivery after verifying receipt with the customer.
-- The same cash settlement function used by driver-confirmed delivery records commission once.
create function private.admin_confirm_disputed_order_delivery(
  p_dispute_id uuid,
  p_cash_collected_minor bigint,
  p_resolution text
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_dispute public.order_disputes%rowtype;
  v_order public.orders%rowtype;
  v_resolution text;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_cash_collected_minor is null or p_cash_collected_minor not between 0 and 100000000 then
    raise exception 'Enter a valid amount collected from the customer';
  end if;
  if p_resolution is null or char_length(trim(p_resolution)) not between 5 and 2000 then
    raise exception 'A delivery verification note is required';
  end if;

  select * into v_dispute
  from public.order_disputes
  where id = p_dispute_id and resolved_at is null
  for update;
  if not found then raise exception 'Open dispute not found'; end if;

  select * into v_order
  from public.orders
  where id = v_dispute.order_id
  for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status not in ('disputed', 'delivering') then
    raise exception 'Order is not awaiting delivery confirmation';
  end if;
  if v_order.driver_id is null or v_order.purchase_amount_minor is null
    or v_order.commission_rate_basis_points is null then
    raise exception 'Order is missing driver, purchase, or commission details';
  end if;
  if exists (
    select 1 from public.cash_settlements s
    where s.order_id = v_order.id
      and not exists (select 1 from public.cash_settlement_reversals r where r.settlement_id = s.id)
  ) then raise exception 'Order already has an active settlement'; end if;

  v_resolution := trim(p_resolution);
  update public.orders
    set status = 'delivered', delivered_at = now(), cash_collected_minor = p_cash_collected_minor,
        delivery_code_hash = null, delivery_code_expires_at = null
    where id = v_order.id;

  insert into public.order_events(order_id, actor_id, event_type, details)
    values(v_order.id, v_actor, 'delivery_confirmed', jsonb_build_object(
      'admin_confirmed', true,
      'customer_receipt_verified', true,
      'verification_note', v_resolution,
      'purchase_amount_minor', v_order.purchase_amount_minor,
      'delivery_fee_minor', v_order.delivery_fee_minor,
      'cash_collected_minor', p_cash_collected_minor
    ));

  perform private.settle_order_cash(v_order.id, gen_random_uuid(), v_actor);

  update public.order_disputes
    set resolved_by = v_actor, resolved_at = now(),
        resolution = pg_catalog.left('أكدت الإدارة استلام العميل للطلب. ' || v_resolution, 2000)
    where id = v_dispute.id;

  insert into public.order_events(order_id, actor_id, event_type, details)
    values(v_order.id, v_actor, 'dispute_resolved', jsonb_build_object(
      'dispute_id', v_dispute.id,
      'resolution', v_resolution,
      'status_before', v_order.status,
      'restored_status', 'settled',
      'admin_confirmed_delivery', true,
      'cash_collected_minor', p_cash_collected_minor
    ));
  insert into public.admin_audit_log(actor_id, action, entity_type, entity_id, reason, before_data, after_data)
    values(v_actor, 'admin_confirm_delivery', 'order', v_order.id::text, v_resolution,
      jsonb_build_object('status', v_order.status, 'dispute_id', v_dispute.id),
      jsonb_build_object('status', 'settled', 'cash_collected_minor', p_cash_collected_minor));
end;
$$;

revoke all on function private.admin_confirm_disputed_order_delivery(uuid, bigint, text) from public, anon, authenticated;
grant execute on function private.admin_confirm_disputed_order_delivery(uuid, bigint, text) to authenticated;

create function public.admin_confirm_disputed_order_delivery(p_dispute_id uuid, p_cash_collected_minor bigint, p_resolution text)
returns void language sql security invoker set search_path = '' as $$
  select private.admin_confirm_disputed_order_delivery($1, $2, $3);
$$;
revoke all on function public.admin_confirm_disputed_order_delivery(uuid, bigint, text) from public, anon;
grant execute on function public.admin_confirm_disputed_order_delivery(uuid, bigint, text) to authenticated;
