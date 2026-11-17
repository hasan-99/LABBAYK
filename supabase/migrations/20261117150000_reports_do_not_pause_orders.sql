-- A support report no longer pauses the order: the order continues while administrators review the report.
create or replace function private.open_order_dispute(p_order_id uuid,p_reason text,p_details text,p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_order public.orders%rowtype; v_existing public.order_disputes%rowtype; v_dispute_id uuid;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key is required'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 3 and 120 then raise exception 'Choose a valid issue category'; end if;
  if p_details is null or char_length(trim(p_details)) not between 5 and 2000 then raise exception 'Describe the issue in at least five characters'; end if;
  select * into v_existing from public.order_disputes where idempotency_key=p_idempotency_key;
  if found then
    if v_existing.opened_by<>v_actor or v_existing.order_id<>p_order_id or v_existing.reason<>trim(p_reason) or v_existing.details<>trim(p_details) then
      raise exception 'Idempotency key was already used for different dispute details';
    end if;
    return v_existing.id;
  end if;
  select * into v_order from public.orders where id=p_order_id and
    (customer_id=v_actor or driver_id=v_actor) for update;
  if not found then raise exception 'Order not found for this account'; end if;
  if v_order.status not in ('accepted','assigned','shopping','awaiting_approval','purchased','delivering','delivered','settled') then
    raise exception 'This order state cannot be sent to support';
  end if;
  insert into public.order_disputes(order_id,opened_by,idempotency_key,reason,details,previous_order_status)
    values(p_order_id,v_actor,p_idempotency_key,trim(p_reason),trim(p_details),v_order.status)
    returning id into v_dispute_id;
  insert into public.order_events(order_id,actor_id,event_type,details)
    values(p_order_id,v_actor,'order_disputed',jsonb_build_object('dispute_id',v_dispute_id,'reason',trim(p_reason)));
  return v_dispute_id;
end;
$$;


create or replace function private.resolve_order_dispute(p_dispute_id uuid,p_resolution text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_dispute public.order_disputes%rowtype; v_status text;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_resolution is null or char_length(trim(p_resolution)) not between 5 and 2000 then raise exception 'A resolution summary is required'; end if;
  select * into v_dispute from public.order_disputes where id=p_dispute_id and resolved_at is null for update;
  if not found then raise exception 'Open dispute not found'; end if;
  select status into v_status from public.orders where id=v_dispute.order_id for update;
  update public.order_disputes set resolved_by=v_actor,resolved_at=now(),resolution=trim(p_resolution) where id=p_dispute_id;
  -- Reports no longer pause orders. Only orders paused by the old behaviour are put back to their previous status.
  if v_status='disputed' then
    update public.orders set status=v_dispute.previous_order_status where id=v_dispute.order_id;
  end if;
  insert into public.order_events(order_id,actor_id,event_type,details)
    values(v_dispute.order_id,v_actor,'dispute_resolved',jsonb_build_object('dispute_id',v_dispute.id,'resolution',trim(p_resolution)));
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,reason,before_data,after_data)
    values(v_actor,'resolve_order_dispute','order_dispute',v_dispute.id::text,trim(p_resolution),
      jsonb_build_object('status','open'),jsonb_build_object('status','resolved'));
  return 'resolved';
end;
$$;
