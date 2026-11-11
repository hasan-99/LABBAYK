-- Let drivers read an order only while they have its active offer. Qualify the
-- outer order id so it cannot resolve to the inner order_offers row.
drop policy if exists orders_customer_driver_admin_select on public.orders;

create policy orders_customer_driver_admin_select on public.orders
  for select to authenticated
  using (
    customer_id = (select auth.uid())
    or (select private.is_admin())
    or driver_id = (select auth.uid())
    or exists (
      select 1
      from public.order_offers o
      where o.order_id = orders.id
        and o.driver_id = (select auth.uid())
        and o.status = 'pending'
        and o.expires_at > now()
    )
  );
