-- Record in the order history which status an order was in and which status it was restored to when a report is resolved.
create or replace function private.resolve_order_dispute(p_dispute_id uuid,p_resolution text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_dispute public.order_disputes%rowtype; v_status text; v_restored text;
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
    v_restored := v_dispute.previous_order_status;
  end if;
  insert into public.order_events(order_id,actor_id,event_type,details)
    values(v_dispute.order_id,v_actor,'dispute_resolved',jsonb_build_object('dispute_id',v_dispute.id,'resolution',trim(p_resolution),'status_before',v_status,'restored_status',v_restored));
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,reason,before_data,after_data)
    values(v_actor,'resolve_order_dispute','order_dispute',v_dispute.id::text,trim(p_resolution),
      jsonb_build_object('status','open'),jsonb_build_object('status','resolved'));
  return 'resolved';
end;
$$;
