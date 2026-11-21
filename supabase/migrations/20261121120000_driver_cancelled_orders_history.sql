-- A cancelled order is detached from its driver (orders.driver_id is cleared), so it never reached
-- the driver's history. Drivers can now list the cancelled orders they were offered or assigned,
-- through their own (revoked) offer rows; nothing else about the order is exposed.

create function private.get_driver_cancelled_orders()
returns table(id uuid, request_text text, delivery_fee_minor bigint, created_at timestamptz, cancelled_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.driver_profiles where user_id=auth.uid()) then raise exception 'Driver access required'; end if;
  return query
    select o.id, o.request_text, o.delivery_fee_minor::bigint, o.created_at,
      (select max(e.created_at) from public.order_events e
        where e.order_id=o.id and e.event_type in ('customer_cancelled','admin_cancelled'))
    from public.orders o
    where o.status='cancelled'
      and exists(select 1 from public.order_offers f where f.order_id=o.id and f.driver_id=auth.uid() and f.status='revoked')
    order by 5 desc nulls last, o.created_at desc
    limit 50;
end;
$$;
revoke all on function private.get_driver_cancelled_orders() from public,anon;
grant execute on function private.get_driver_cancelled_orders() to authenticated;
create function public.get_driver_cancelled_orders()
returns table(id uuid, request_text text, delivery_fee_minor bigint, created_at timestamptz, cancelled_at timestamptz)
language sql security invoker set search_path = '' as $$ select * from private.get_driver_cancelled_orders(); $$;
revoke all on function public.get_driver_cancelled_orders() from public,anon;
grant execute on function public.get_driver_cancelled_orders() to authenticated;
