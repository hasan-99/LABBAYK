-- Drivers must be told when an order they were offered, or were assigned, is cancelled.
-- Before this, the cancel functions cleared orders.driver_id and revoked the offers first, so the
-- order-event notification trigger found no driver and nobody on the driver side heard about it.
-- The drivers are collected before anything is cleared and notified once the event row exists.

create or replace function private.cancel_customer_order(p_order_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid:=auth.uid(); v_order public.orders%rowtype; v_event bigint; v_drivers uuid[];
begin
  if p_reason is null or char_length(trim(p_reason)) not between 3 and 300 then raise exception 'A cancellation reason is required'; end if;
  select * into v_order from public.orders where id=p_order_id and customer_id=v_actor for update;
  if not found then raise exception 'Customer order not found'; end if;
  if v_order.status not in ('requested','quoted','searching','accepted','assigned','shopping','awaiting_approval')
     or (v_order.status='shopping' and v_order.purchase_amount_minor is not null) then raise exception 'Order cannot be cancelled in its current state'; end if;
  select coalesce(array_agg(distinct d), '{}') into v_drivers from (
    select driver_id as d from public.order_offers where order_id=p_order_id and status in ('pending','accepted')
    union select v_order.driver_id where v_order.driver_id is not null
  ) x where d is not null;
  update public.order_offers set status='revoked',responded_at=coalesce(responded_at,now())
    where order_id=p_order_id and status in ('pending','accepted');
  update public.orders set status='cancelled',driver_id=null,purchase_amount_minor=null,purchase_approved_at=null where id=p_order_id;
  insert into public.order_events(order_id,actor_id,event_type,details)
  values(p_order_id,v_actor,'customer_cancelled',jsonb_build_object('reason',trim(p_reason),'previous_status',v_order.status))
  returning id into v_event;
  insert into public.notifications(recipient_id,order_id,source_event_id,event_type,title,body)
  select d,p_order_id,v_event,'customer_cancelled','أُلغي الطلب','ألغى العميل الطلب. ما عاد مطلوب منك تنفيذه.'
  from unnest(v_drivers) d
  on conflict(recipient_id,source_event_id) where source_event_id is not null do nothing;
end;
$$;

create or replace function private.cancel_admin_order(p_order_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid:=auth.uid(); v_order public.orders%rowtype; v_reported boolean; v_after_purchase boolean; v_event bigint; v_drivers uuid[];
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 5 and 500 then raise exception 'A cancellation reason is required'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  v_reported := exists (select 1 from public.order_disputes where order_id=p_order_id and resolved_at is null);
  v_after_purchase := v_order.status in ('purchased','delivering')
    or (v_order.status='shopping' and v_order.purchase_amount_minor is not null)
    or (v_order.status='disputed' and v_order.purchase_amount_minor is not null);
  if v_order.status in ('delivered','settled','cancelled') then raise exception 'Order is already final'; end if;
  if v_after_purchase and not v_reported then raise exception 'Order requires a dispute instead of cancellation'; end if;
  if v_order.status not in ('requested','quoted','searching','accepted','assigned','shopping','awaiting_approval','purchased','delivering','disputed') then
    raise exception 'Order cannot be cancelled';
  end if;
  select coalesce(array_agg(distinct d), '{}') into v_drivers from (
    select driver_id as d from public.order_offers where order_id=p_order_id and status in ('pending','accepted')
    union select v_order.driver_id where v_order.driver_id is not null
  ) x where d is not null;
  update public.order_offers set status='revoked',responded_at=coalesce(responded_at,now())
    where order_id=p_order_id and status in ('pending','accepted');
  if v_after_purchase then
    update public.orders set status='cancelled' where id=p_order_id;
  else
    update public.orders set status='cancelled',driver_id=null,purchase_amount_minor=null,purchase_approved_at=null where id=p_order_id;
  end if;
  insert into public.order_events(order_id,actor_id,event_type,details)
  values(p_order_id,v_actor,'admin_cancelled',jsonb_build_object('reason',trim(p_reason),'previous_status',v_order.status,'after_purchase',v_after_purchase))
  returning id into v_event;
  insert into public.notifications(recipient_id,order_id,source_event_id,event_type,title,body)
  select d,p_order_id,v_event,'admin_cancelled','أُلغي الطلب','ألغت الإدارة الطلب. ما عاد مطلوب منك تنفيذه.'
  from unnest(v_drivers) d
  on conflict(recipient_id,source_event_id) where source_event_id is not null do nothing;
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,reason,before_data,after_data)
  values(v_actor,'cancel_order','order',p_order_id::text,trim(p_reason),jsonb_build_object('status',v_order.status),jsonb_build_object('status','cancelled','after_purchase',v_after_purchase));
  -- Close any open report on a cancelled order.
  update public.order_disputes set resolved_by=v_actor,resolved_at=now(),resolution='أُلغي الطلب: '||trim(p_reason)
    where order_id=p_order_id and resolved_at is null;
end;
$$;
