-- Notify the assigned driver and administrators once when shopping/delivery exceed their SLA.
alter table public.orders
  add column if not exists shopping_driver_alerted_at timestamptz,
  add column if not exists shopping_admin_alerted_at timestamptz,
  add column if not exists delivery_driver_alerted_at timestamptz,
  add column if not exists delivery_admin_alerted_at timestamptz;

-- The generic event notifier targets customers too. Delay alerts are sent explicitly below.
drop trigger if exists order_event_notification on public.order_events;
create trigger order_event_notification after insert on public.order_events
  for each row when (new.event_type not in (
    'no_driver_response', 'customer_wait_notice',
    'order_delay_driver_shopping', 'order_delay_admin_shopping',
    'order_delay_driver_delivery', 'order_delay_admin_delivery'
  ))
  execute function private.notify_order_event();

create or replace function private.flag_order_delay_alerts()
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  v_order record;
  v_event bigint;
  v_count integer := 0;
  v_body text;
begin
  for v_order in
    select o.id, o.driver_id, o.status,
      o.shopping_driver_alerted_at, o.shopping_admin_alerted_at,
      o.delivery_driver_alerted_at, o.delivery_admin_alerted_at,
      case when o.status = 'shopping' then e.shopping_started_at else e.delivery_started_at end as stage_started_at
    from public.orders o
    cross join lateral (
      select
        max(oe.created_at) filter (where oe.event_type = 'shopping_started') as shopping_started_at,
        max(oe.created_at) filter (where oe.event_type = 'delivery_started') as delivery_started_at
      from public.order_events oe where oe.order_id = o.id
    ) e
    where o.driver_id is not null
      and (
        (o.status = 'shopping' and e.shopping_started_at is not null and e.shopping_started_at <= now() - interval '30 minutes'
          and (o.shopping_driver_alerted_at is null or (o.shopping_admin_alerted_at is null and e.shopping_started_at <= now() - interval '40 minutes')))
        or
        (o.status = 'delivering' and e.delivery_started_at is not null and e.delivery_started_at <= now() - interval '30 minutes'
          and (o.delivery_driver_alerted_at is null or (o.delivery_admin_alerted_at is null and e.delivery_started_at <= now() - interval '45 minutes')))
      )
    order by o.updated_at
    for update of o skip locked
  loop
    if v_order.status = 'shopping' then
      if v_order.shopping_driver_alerted_at is null and v_order.stage_started_at <= now() - interval '30 minutes' then
        insert into public.order_events(order_id, event_type, details)
          values (v_order.id, 'order_delay_driver_shopping', jsonb_build_object('stage', 'shopping', 'threshold_minutes', 30))
          returning id into v_event;
        v_body := 'الطلب #' || left(v_order.id::text, 6) || ' صارله أكثر من 30 دقيقة بالتسوّق. حدّث الحالة أو تواصل مع الإدارة.';
        insert into public.notifications(recipient_id, order_id, source_event_id, event_type, title, body)
          values (v_order.driver_id, v_order.id, v_event, 'order_delay_driver_shopping', 'تأخير في تنفيذ الطلب', v_body)
          on conflict (recipient_id, source_event_id) where source_event_id is not null do nothing;
        update public.orders set shopping_driver_alerted_at = now() where id = v_order.id;
        v_count := v_count + 1;
      end if;
      if v_order.shopping_admin_alerted_at is null and v_order.stage_started_at <= now() - interval '40 minutes' then
        insert into public.order_events(order_id, event_type, details)
          values (v_order.id, 'order_delay_admin_shopping', jsonb_build_object('stage', 'shopping', 'threshold_minutes', 40))
          returning id into v_event;
        v_body := 'الطلب #' || left(v_order.id::text, 6) || ' متأخر في التسوّق منذ أكثر من 40 دقيقة. افتح الطلب للمتابعة.';
        insert into public.notifications(recipient_id, order_id, source_event_id, event_type, title, body)
          select ur.user_id, v_order.id, v_event, 'order_delay_admin_shopping', 'طلب متأخر في التسوّق', v_body
          from public.user_roles ur where ur.role = 'super_admin'
          on conflict (recipient_id, source_event_id) where source_event_id is not null do nothing;
        update public.orders set shopping_admin_alerted_at = now() where id = v_order.id;
        v_count := v_count + 1;
      end if;
    elsif v_order.status = 'delivering' then
      if v_order.delivery_driver_alerted_at is null and v_order.stage_started_at <= now() - interval '30 minutes' then
        insert into public.order_events(order_id, event_type, details)
          values (v_order.id, 'order_delay_driver_delivery', jsonb_build_object('stage', 'delivering', 'threshold_minutes', 30))
          returning id into v_event;
        v_body := 'الطلب #' || left(v_order.id::text, 6) || ' صارله أكثر من 30 دقيقة بالطريق. حدّث حالته أو تواصل مع الإدارة.';
        insert into public.notifications(recipient_id, order_id, source_event_id, event_type, title, body)
          values (v_order.driver_id, v_order.id, v_event, 'order_delay_driver_delivery', 'تأخير في توصيل الطلب', v_body)
          on conflict (recipient_id, source_event_id) where source_event_id is not null do nothing;
        update public.orders set delivery_driver_alerted_at = now() where id = v_order.id;
        v_count := v_count + 1;
      end if;
      if v_order.delivery_admin_alerted_at is null and v_order.stage_started_at <= now() - interval '45 minutes' then
        insert into public.order_events(order_id, event_type, details)
          values (v_order.id, 'order_delay_admin_delivery', jsonb_build_object('stage', 'delivering', 'threshold_minutes', 45))
          returning id into v_event;
        v_body := 'الطلب #' || left(v_order.id::text, 6) || ' متأخر بالتوصيل منذ أكثر من 45 دقيقة. افتح الطلب للمتابعة.';
        insert into public.notifications(recipient_id, order_id, source_event_id, event_type, title, body)
          select ur.user_id, v_order.id, v_event, 'order_delay_admin_delivery', 'طلب متأخر بالتوصيل', v_body
          from public.user_roles ur where ur.role = 'super_admin'
          on conflict (recipient_id, source_event_id) where source_event_id is not null do nothing;
        update public.orders set delivery_admin_alerted_at = now() where id = v_order.id;
        v_count := v_count + 1;
      end if;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function private.flag_order_delay_alerts() from public, anon, authenticated;

-- Keep the no-driver escalation aligned with the agreed 15-minute deadline.
create or replace function private.flag_unanswered_orders()
returns integer language plpgsql security definer set search_path = ''
as $$
declare v_order record; v_event bigint; v_count integer := 0;
begin
  for v_order in
    select o.id from public.orders o
    where o.status = 'searching' and o.driver_id is null and o.delivery_quote_set_at is not null
      and o.delivery_quote_set_at <= now() - interval '15 minutes'
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

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'flag-order-delay-alerts';
  perform cron.schedule('flag-order-delay-alerts', '* * * * *', 'select private.flag_order_delay_alerts()');
end;
$$;
