-- Lets a customer see the name and phone of the driver assigned to their own order.
create or replace function private.get_order_driver_contact(p_order_id uuid)
returns table(display_name text, phone text)
language plpgsql security definer set search_path = ''
as $$
begin
  return query
  select coalesce(nullif(trim(p.display_name), ''), 'السائق'), dp.phone_e164
  from public.orders o
  join public.profiles p on p.id = o.driver_id
  left join public.driver_profiles dp on dp.user_id = o.driver_id
  where o.id = p_order_id
    and o.customer_id = auth.uid()
    and o.driver_id is not null
    and o.status in ('accepted', 'assigned', 'shopping', 'awaiting_approval', 'purchased', 'delivering', 'delivered', 'settled');
end;
$$;

create function public.get_order_driver_contact(p_order_id uuid)
returns table(display_name text, phone text)
language sql security invoker set search_path = ''
as $$ select * from private.get_order_driver_contact($1); $$;

revoke all on function private.get_order_driver_contact(uuid) from public, anon;
revoke all on function public.get_order_driver_contact(uuid) from public, anon;
grant execute on function private.get_order_driver_contact(uuid) to authenticated;
grant execute on function public.get_order_driver_contact(uuid) to authenticated;
