-- A Storage object can exist even when a mobile upload sent an invalid tiny body.
-- Do not complete or settle delivery until the uploaded proof has image-sized content.
create or replace function private.confirm_order_delivery_with_photo(
  p_order_id uuid,
  p_proof_path text,
  p_cash_collected_minor bigint default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
begin
  if p_cash_collected_minor is not null and p_cash_collected_minor not between 0 and 100000000 then
    raise exception 'Invalid collected amount';
  end if;
  if char_length(coalesce(p_note, '')) > 500 then raise exception 'Note is too long'; end if;

  select * into v_order
  from public.orders
  where id = p_order_id and driver_id = v_actor
  for update;
  if not found then raise exception 'Assigned order not found'; end if;
  if not exists (
    select 1 from public.driver_profiles
    where user_id = v_actor and review_status = 'approved'
  ) then raise exception 'Approved driver required'; end if;
  if v_order.status <> 'delivering' then raise exception 'Order is not out for delivery'; end if;
  if p_proof_path is null or p_proof_path !~ ('^' || p_order_id::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'Invalid delivery photo path';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'delivery-proofs'
      and name = p_proof_path
      and coalesce((metadata->>'size')::bigint, 0) >= 1024
  ) then raise exception 'Delivery photo is missing or invalid'; end if;

  update public.orders
  set status = 'delivered',
      delivered_at = now(),
      delivery_proof_path = p_proof_path,
      cash_collected_minor = p_cash_collected_minor,
      delivery_note = nullif(trim(coalesce(p_note, '')), ''),
      delivery_code_hash = null,
      delivery_code_expires_at = null
  where id = p_order_id;

  insert into public.order_events(order_id, actor_id, event_type, details)
  values (
    p_order_id,
    v_actor,
    'delivery_confirmed',
    jsonb_build_object(
      'purchase_amount_minor', v_order.purchase_amount_minor,
      'delivery_fee_minor', v_order.delivery_fee_minor,
      'proof_path', p_proof_path,
      'cash_collected_minor', p_cash_collected_minor,
      'note', nullif(trim(coalesce(p_note, '')), '')
    )
  );

  if v_order.purchase_amount_minor is not null
    and v_order.commission_rate_basis_points is not null then
    perform private.settle_order_cash(p_order_id, gen_random_uuid(), v_actor);
  end if;
end;
$$;

revoke all on function private.confirm_order_delivery_with_photo(uuid, text, bigint, text) from public, anon;
grant execute on function private.confirm_order_delivery_with_photo(uuid, text, bigint, text) to authenticated;
