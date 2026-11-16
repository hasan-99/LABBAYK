-- Delivery is confirmed by the assigned driver with a photo instead of a customer-held code.
alter table public.orders add column if not exists delivery_proof_path text;
grant select (delivery_proof_path) on public.orders to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('delivery-proofs', 'delivery-proofs', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy delivery_proofs_driver_upload
on storage.objects for insert to authenticated
with check (
  bucket_id = 'delivery-proofs'
  and array_length(storage.foldername(name), 1) = 1
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and exists (
    select 1 from public.orders o
    where o.id = case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((storage.foldername(name))[1])::uuid
    end
      and o.driver_id = (select auth.uid())
      and o.status = 'delivering'
  )
);

create policy delivery_proofs_participant_read
on storage.objects for select to authenticated
using (
  bucket_id = 'delivery-proofs'
  and array_length(storage.foldername(name), 1) = 1
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and exists (
    select 1 from public.orders o
    where o.id = case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((storage.foldername(name))[1])::uuid
    end
      and (o.customer_id = (select auth.uid())
        or o.driver_id = (select auth.uid())
        or (select private.is_admin()))
  )
);

create or replace function private.confirm_order_delivery_with_photo(p_order_id uuid, p_proof_path text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_order public.orders%rowtype;
begin
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
        delivery_code_hash = null, delivery_code_expires_at = null
    where id = p_order_id;
  insert into public.order_events(order_id, actor_id, event_type, details)
  values (p_order_id, v_actor, 'delivery_confirmed',
    jsonb_build_object('purchase_amount_minor', v_order.purchase_amount_minor,
      'delivery_fee_minor', v_order.delivery_fee_minor, 'proof_path', p_proof_path));
end;
$$;

create function public.confirm_order_delivery_with_photo(p_order_id uuid, p_proof_path text)
returns void language sql security invoker set search_path = ''
as $$ select private.confirm_order_delivery_with_photo($1, $2); $$;

revoke all on function private.confirm_order_delivery_with_photo(uuid, text) from public, anon;
revoke all on function public.confirm_order_delivery_with_photo(uuid, text) from public, anon;
grant execute on function private.confirm_order_delivery_with_photo(uuid, text) to authenticated;
grant execute on function public.confirm_order_delivery_with_photo(uuid, text) to authenticated;
