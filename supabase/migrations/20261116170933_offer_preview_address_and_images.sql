drop policy if exists addresses_select_owner_driver_admin on public.addresses;
create policy addresses_select_owner_driver_admin on public.addresses
  for select to authenticated using (
    user_id=(select auth.uid())
    or (select private.is_admin())
    or exists (
      select 1 from public.orders o
      where o.address_id=addresses.id and o.driver_id=(select auth.uid())
    )
    or exists (
      select 1 from public.order_offers oo
      join public.orders o on o.id=oo.order_id
      where o.address_id=addresses.id and oo.driver_id=(select auth.uid())
        and oo.status='pending' and oo.expires_at>now()
    )
  );

drop policy if exists order_images_participant_read on storage.objects;
create policy order_images_participant_read on storage.objects
  for select to authenticated using (
    bucket_id='order-images'
    and array_length(storage.foldername(name),1)=1
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1 from public.orders o
      where o.id=case
        when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[1])::uuid
      end
        and (
          o.customer_id=(select auth.uid())
          or o.driver_id=(select auth.uid())
          or (select private.is_admin())
          or exists (
            select 1 from public.order_offers oo
            where oo.order_id=o.id and oo.driver_id=(select auth.uid())
              and oo.status='pending' and oo.expires_at>now()
          )
        )
    )
  );
