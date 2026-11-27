-- Record when a driver accepts an order so the customer's home screen can show the 45-minute delivery countdown,
-- and expose the database clock so phones with a wrong clock still count down correctly.
alter table public.orders add column if not exists accepted_at timestamptz;

-- Orders already accepted keep their real acceptance time (taken from the audit trail).
update public.orders o
set accepted_at = e.accepted_at
from (
  select order_id, min(created_at) as accepted_at
  from public.order_events
  where event_type = 'driver_accepted'
  group by order_id
) e
where o.id = e.order_id and o.accepted_at is null and o.driver_id is not null;

create or replace function private.accept_order_offer(p_offer_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_driver_id uuid:=auth.uid(); v_offer public.order_offers%rowtype; v_order public.orders%rowtype;
begin
  if v_driver_id is null then raise exception 'Authentication required'; end if;
  perform 1 from public.driver_profiles dp join public.user_roles ur on ur.user_id=dp.user_id
    where dp.user_id=v_driver_id and ur.role='driver' and dp.review_status='approved' and dp.is_online for update of dp;
  if not found then raise exception 'Approved online driver access required'; end if;
  select * into v_offer from public.order_offers where id=p_offer_id and driver_id=v_driver_id and status='pending' and expires_at>now() for update;
  if not found then raise exception 'Offer expired or unavailable'; end if;
  select * into v_order from public.orders where id=v_offer.order_id for update;
  if not found or v_order.status<>'searching' or v_order.driver_id is not null then raise exception 'Another driver already accepted this order'; end if;
  update public.orders set status='accepted',driver_id=v_driver_id,accepted_at=now() where id=v_order.id;
  update public.order_offers set status='accepted',responded_at=now() where id=v_offer.id;
  update public.order_offers set status='revoked',responded_at=now() where order_id=v_order.id and id<>v_offer.id and status='pending';
  insert into public.order_events(order_id,actor_id,event_type) values(v_order.id,v_driver_id,'driver_accepted');
  return v_order.id;
end;
$$;

-- A cancelled order has no driver any more, so it has no countdown either.
create or replace function private.clear_accepted_at_without_driver()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.driver_id is null then new.accepted_at := null; end if;
  return new;
end;
$$;
drop trigger if exists orders_clear_accepted_at on public.orders;
create trigger orders_clear_accepted_at before update of driver_id on public.orders
  for each row when (new.driver_id is null and old.accepted_at is not null)
  execute function private.clear_accepted_at_without_driver();

-- The database clock, for the countdown. It reveals nothing but the time.
create or replace function public.server_now()
returns timestamptz language sql stable set search_path = ''
as $$ select now(); $$;
revoke all on function public.server_now() from public, anon;
grant execute on function public.server_now() to authenticated;
