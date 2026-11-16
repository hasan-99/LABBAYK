drop policy addresses_select_owner_driver_admin on public.addresses;

create policy addresses_select_owner_driver_admin on public.addresses
  for select to authenticated using (
    user_id = (select auth.uid())
    or (select private.is_admin())
    or exists (
      select 1 from public.orders o
      where o.address_id = addresses.id
        and o.driver_id = (select auth.uid())
    )
  );
