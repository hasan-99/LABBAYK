revoke select (delivery_quote_set_by) on public.orders from authenticated;
create index if not exists orders_delivery_quote_set_by_idx
  on public.orders (delivery_quote_set_by)
  where delivery_quote_set_by is not null;
