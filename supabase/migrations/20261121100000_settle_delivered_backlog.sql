-- Delivery now settles automatically (20261120120000), but orders that were delivered before
-- that migration were left waiting for the admin's "confirm collection" step. Settle them now so
-- nothing is left in the admin Money > "للتسوية" list.
do $$
declare r record;
begin
  for r in
    select id, driver_id from public.orders
    where status = 'delivered' and driver_id is not null
      and purchase_amount_minor is not null and commission_rate_basis_points is not null
  loop
    begin
      perform private.settle_order_cash(r.id, gen_random_uuid(), r.driver_id);
    exception when others then
      raise notice 'Skipped order %: %', r.id, sqlerrm;
    end;
  end loop;
end $$;
