-- Administrators can pause an order that has an open report. Resolving the report puts the order back.
create or replace function private.admin_pause_order(p_dispute_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_dispute public.order_disputes%rowtype; v_status text;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  select * into v_dispute from public.order_disputes where id = p_dispute_id and resolved_at is null for update;
  if not found then raise exception 'Open dispute not found'; end if;
  select status into v_status from public.orders where id = v_dispute.order_id for update;
  if v_status not in ('accepted', 'assigned', 'shopping', 'awaiting_approval', 'purchased', 'delivering') then
    raise exception 'This order cannot be paused';
  end if;
  update public.order_disputes set previous_order_status = v_status where id = p_dispute_id;
  update public.orders set status = 'disputed' where id = v_dispute.order_id;
  insert into public.order_events(order_id, actor_id, event_type, details)
    values (v_dispute.order_id, v_actor, 'order_paused_by_admin', jsonb_build_object('dispute_id', p_dispute_id, 'previous_status', v_status));
  insert into public.admin_audit_log(actor_id, action, entity_type, entity_id, reason, before_data, after_data)
    values (v_actor, 'pause_order', 'order', v_dispute.order_id::text, 'إيقاف مؤقت بسبب بلاغ',
      jsonb_build_object('status', v_status), jsonb_build_object('status', 'disputed'));
end;
$$;

create function public.admin_pause_order(p_dispute_id uuid)
returns void language sql security invoker set search_path = '' as $$ select private.admin_pause_order($1); $$;

revoke all on function private.admin_pause_order(uuid) from public, anon;
revoke all on function public.admin_pause_order(uuid) from public, anon;
grant execute on function private.admin_pause_order(uuid) to authenticated;
grant execute on function public.admin_pause_order(uuid) to authenticated;
