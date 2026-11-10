create table public.notifications (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  source_event_id bigint references public.order_events(id) on delete cascade,
  source_offer_id uuid references public.order_offers(id) on delete cascade,
  event_type text not null check (char_length(event_type) between 1 and 60),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check ((source_event_id is null) <> (source_offer_id is null))
);
create unique index notifications_event_recipient_unique on public.notifications(recipient_id,source_event_id) where source_event_id is not null;
create index notifications_recipient_created_idx on public.notifications(recipient_id,created_at desc);
create index notifications_unread_idx on public.notifications(recipient_id,created_at desc) where read_at is null;
alter table public.notifications enable row level security;
create policy notifications_select_own on public.notifications
  for select to authenticated using (recipient_id=(select auth.uid()));
revoke all on public.notifications from public,anon,authenticated;
grant select on public.notifications to authenticated;

create function private.notify_order_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_title text; v_body text;
begin
  select * into v_order from public.orders where id=new.order_id;
  if not found then return new; end if;
  v_title:=case new.event_type
    when 'order_requested' then 'طلب جديد'
    when 'offers_dispatched' then 'عم نفتش على سائق'
    when 'driver_accepted' then 'السائق قبل طلبك'
    when 'driver_declined_offer' then 'عرض سائق'
    when 'purchase_recorded' then 'تحديث على المشتريات'
    when 'purchase_approval_requested' then 'بحاجة لموافقتك'
    when 'purchase_approved' then 'تمت الموافقة على المشتريات'
    when 'purchase_rejected' then 'تم رفض المبلغ المقترح'
    when 'purchase_completed' then 'تم تأكيد الشراء'
    when 'delivery_started' then 'طلبك بالطريق'
    when 'delivery_confirmed' then 'تم تأكيد التسليم'
    when 'customer_cancelled' then 'تم إلغاء الطلب'
    when 'admin_cancelled' then 'تم إلغاء الطلب'
    when 'cash_settled' then 'اكتملت تسوية الطلب'
    else 'تحديث على الطلب'
  end;
  v_body:=case new.event_type
    when 'order_requested' then 'وصل طلب جديد لفريق التشغيل.'
    when 'offers_dispatched' then 'عم نبحث عن سائق متاح ضمن منطقتك.'
    when 'driver_accepted' then 'تم قبول الطلب. تابع التفاصيل من طلباتك.'
    when 'driver_declined_offer' then 'اعتذر سائق عن العرض؛ الطلب بحاجة لمتابعة.'
    when 'purchase_recorded' then 'حدّث السائق مبلغ المشتريات المقترح.'
    when 'purchase_approval_requested' then 'راجع مبلغ المشتريات المقترح قبل ما يكمل السائق.'
    when 'purchase_approved' then 'وافق العميل؛ فيك تكمل تنفيذ الطلب.'
    when 'purchase_rejected' then 'رفض العميل مبلغ المشتريات المقترح.'
    when 'purchase_completed' then 'أكد السائق إتمام الشراء.'
    when 'delivery_started' then 'السائق بدأ التوصيل إليك.'
    when 'delivery_confirmed' then 'تأكد تسليم الطلب بنجاح.'
    when 'customer_cancelled' then 'ألغى العميل الطلب؛ راجع حالة المهمة.'
    when 'admin_cancelled' then 'ألغت الإدارة الطلب.'
    when 'cash_settled' then 'تم تسجيل التسوية النقدية والعمولة.'
    else 'في تحديث جديد. افتح الطلب لمراجعة حالته.'
  end;

  insert into public.notifications(recipient_id,order_id,source_event_id,event_type,title,body)
  select targets.recipient_id,new.order_id,new.id,new.event_type,v_title,v_body
  from (
    select v_order.customer_id as recipient_id
    union select v_order.driver_id where v_order.driver_id is not null
    union select ur.user_id from public.user_roles ur where ur.role='super_admin'
      and new.event_type in ('order_requested','customer_cancelled','admin_cancelled','driver_declined_offer','cash_settled')
  ) targets
  where targets.recipient_id is not null and targets.recipient_id is distinct from new.actor_id
  on conflict(recipient_id,source_event_id) where source_event_id is not null do nothing;
  return new;
end;
$$;

create function private.notify_driver_offer()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='INSERT' then
    if new.status<>'pending' then return new; end if;
  elsif old.status='pending' or new.status<>'pending' then return new;
  end if;
  insert into public.notifications(recipient_id,order_id,source_offer_id,event_type,title,body)
    values(new.driver_id,new.order_id,new.id,'offer_received','وصلك عرض توصيل جديد','افتح التطبيق لمراجعة تفاصيل الطلب والرد قبل انتهاء المهلة.');
  return new;
end;
$$;

create function private.mark_notification_read(p_notification_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.notifications set read_at=coalesce(read_at,now())
    where id=p_notification_id and recipient_id=auth.uid();
  if not found then raise exception 'Notification not found'; end if;
end;
$$;

revoke all on function private.notify_order_event() from public,anon,authenticated;
revoke all on function private.notify_driver_offer() from public,anon,authenticated;
revoke all on function private.mark_notification_read(bigint) from public,anon;
grant execute on function private.mark_notification_read(bigint) to authenticated;
create trigger order_event_notification after insert on public.order_events
  for each row execute function private.notify_order_event();
create trigger order_offer_notification after insert or update of status on public.order_offers
  for each row execute function private.notify_driver_offer();
create function public.mark_notification_read(p_notification_id bigint)
returns void language sql security invoker set search_path = '' as $$ select private.mark_notification_read($1); $$;
revoke all on function public.mark_notification_read(bigint) from public,anon;
grant execute on function public.mark_notification_read(bigint) to authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end $$;
