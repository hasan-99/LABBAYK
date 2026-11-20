-- Orders nobody answers.
-- 10 minutes after an order was sent to drivers with no live offer left and no taker, every admin is
-- alerted (the admin then resends it to everyone or assigns one driver). 15 minutes after the send,
-- the customer is told we are still looking and may wait or cancel. A resend resets both clocks
-- because delivery_quote_set_at is refreshed each time the admin sends the order.
alter table public.orders
  add column if not exists no_response_alerted_at timestamptz,
  add column if not exists customer_wait_alerted_at timestamptz;

-- The generic order-event trigger would add its own "تحديث على الطلب" notification for the two new
-- event types first and make the specific messages below conflict. Skip them there.
drop trigger if exists order_event_notification on public.order_events;
create trigger order_event_notification after insert on public.order_events
  for each row when (new.event_type not in ('no_driver_response', 'customer_wait_notice'))
  execute function private.notify_order_event();

create or replace function private.flag_unanswered_orders()
returns integer language plpgsql security definer set search_path = ''
as $$
declare v_order record; v_event bigint; v_count integer := 0;
begin
  for v_order in
    select o.id from public.orders o
    where o.status = 'searching' and o.driver_id is null and o.delivery_quote_set_at is not null
      and o.delivery_quote_set_at <= now() - interval '10 minutes'
      and (o.no_response_alerted_at is null or o.no_response_alerted_at < o.delivery_quote_set_at)
      and not exists (select 1 from public.order_offers oo where oo.order_id = o.id and oo.status = 'pending' and oo.expires_at > now())
    for update of o skip locked
  loop
    insert into public.order_events(order_id, event_type) values (v_order.id, 'no_driver_response') returning id into v_event;
    insert into public.notifications(recipient_id, order_id, source_event_id, event_type, title, body)
      select ur.user_id, v_order.id, v_event, 'no_driver_response', 'طلب ما حدا رد عليه',
        'ما حدا من السائقين رد على الطلب #' || left(v_order.id::text, 8) || '. أعد إرساله للكل أو أسنده لسائق.'
      from public.user_roles ur where ur.role = 'super_admin'
      on conflict (recipient_id, source_event_id) where source_event_id is not null do nothing;
    update public.orders set no_response_alerted_at = now() where id = v_order.id;
    v_count := v_count + 1;
  end loop;

  for v_order in
    select o.id, o.customer_id from public.orders o
    where o.status = 'searching' and o.driver_id is null and o.customer_id is not null and o.delivery_quote_set_at is not null
      and o.delivery_quote_set_at <= now() - interval '15 minutes'
      and (o.customer_wait_alerted_at is null or o.customer_wait_alerted_at < o.delivery_quote_set_at)
    for update of o skip locked
  loop
    insert into public.order_events(order_id, event_type) values (v_order.id, 'customer_wait_notice') returning id into v_event;
    insert into public.notifications(recipient_id, order_id, source_event_id, event_type, title, body)
      values (v_order.customer_id, v_order.id, v_event, 'customer_wait_notice', 'لسا عم ندور على سائق',
        'ما لقينا سائق لطلبك لهلأ. فيك تنتظر شوي أو تلغي الطلب من صفحة طلباتي.')
      on conflict (recipient_id, source_event_id) where source_event_id is not null do nothing;
    update public.orders set customer_wait_alerted_at = now() where id = v_order.id;
  end loop;
  return v_count;
end;
$$;

-- Callable by the apps as a fallback; it only flags orders that are already overdue and is idempotent.
create function public.flag_unanswered_orders()
returns integer language sql security invoker set search_path = '' as $$ select private.flag_unanswered_orders(); $$;

revoke all on function private.flag_unanswered_orders() from public, anon;
revoke all on function public.flag_unanswered_orders() from public, anon;
grant execute on function private.flag_unanswered_orders() to authenticated;
grant execute on function public.flag_unanswered_orders() to authenticated;

-- Runs every minute when pg_cron is available (Supabase: Database > Extensions). Without it the
-- apps call the function above whenever an admin or a waiting customer opens their screen.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('flag-unanswered-orders', '* * * * *', 'select private.flag_unanswered_orders()');
exception when others then
  raise notice 'pg_cron is not available (%); unanswered orders are flagged when the apps call flag_unanswered_orders()', sqlerrm;
end;
$$;
