-- Let administrators pause a stalled post-purchase delivery for review before
-- deciding whether to cancel or restore it. Purchase and driver data stay intact.
create function private.admin_open_order_dispute(
  p_order_id uuid,
  p_reason text,
  p_details text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_existing public.order_disputes%rowtype;
  v_dispute_id uuid;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key is required'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 3 and 120 then raise exception 'Choose a valid issue category'; end if;
  if p_details is null or char_length(trim(p_details)) not between 5 and 2000 then raise exception 'Describe the issue in at least five characters'; end if;

  select * into v_existing from public.order_disputes where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.opened_by <> v_actor or v_existing.order_id <> p_order_id
      or v_existing.reason <> trim(p_reason) or v_existing.details <> trim(p_details) then
      raise exception 'Idempotency key was already used for different dispute details';
    end if;
    return v_existing.id;
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status not in ('shopping', 'purchased', 'delivering') or v_order.purchase_amount_minor is null then
    raise exception 'Administrative review is only available for a purchased order';
  end if;
  if exists (select 1 from public.order_disputes where order_id = p_order_id and resolved_at is null) then
    raise exception 'An active report already exists for this order';
  end if;

  insert into public.order_disputes(order_id, opened_by, idempotency_key, reason, details, previous_order_status)
  values (p_order_id, v_actor, p_idempotency_key, trim(p_reason), trim(p_details), v_order.status)
  returning id into v_dispute_id;

  update public.orders set status = 'disputed' where id = p_order_id;
  insert into public.order_events(order_id, actor_id, event_type, details)
  values (p_order_id, v_actor, 'order_disputed', jsonb_build_object('dispute_id', v_dispute_id, 'reason', trim(p_reason), 'admin_review', true));
  insert into public.admin_audit_log(actor_id, action, entity_type, entity_id, reason, before_data, after_data)
  values (v_actor, 'open_admin_order_review', 'order', p_order_id::text, trim(p_details),
    jsonb_build_object('status', v_order.status), jsonb_build_object('status', 'disputed', 'dispute_id', v_dispute_id));
  return v_dispute_id;
end;
$$;

revoke all on function private.admin_open_order_dispute(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function private.admin_open_order_dispute(uuid, text, text, uuid) to authenticated;

create function public.admin_open_order_dispute(p_order_id uuid, p_reason text, p_details text, p_idempotency_key uuid)
returns uuid language sql security invoker set search_path = '' as $$
  select private.admin_open_order_dispute($1, $2, $3, $4);
$$;
revoke all on function public.admin_open_order_dispute(uuid, text, text, uuid) from public, anon;
grant execute on function public.admin_open_order_dispute(uuid, text, text, uuid) to authenticated;
