drop policy addresses_owner_manage on public.addresses;
create policy addresses_select_owner_driver_admin on public.addresses
  for select to authenticated using (
    user_id = (select auth.uid())
    or (select private.is_admin())
    or exists (
      select 1 from public.orders o
      where o.address_id = id and o.driver_id = (select auth.uid())
    )
  );
create policy addresses_insert_owner_admin on public.addresses
  for insert to authenticated with check (user_id = (select auth.uid()) or (select private.is_admin()));
create policy addresses_update_owner_admin on public.addresses
  for update to authenticated using (user_id = (select auth.uid()) or (select private.is_admin()))
  with check (user_id = (select auth.uid()) or (select private.is_admin()));
create policy addresses_delete_owner_admin on public.addresses
  for delete to authenticated using (user_id = (select auth.uid()) or (select private.is_admin()));
