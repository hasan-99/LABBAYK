-- Saving an administrator's delivery quote now sends the offer directly to drivers.
create or replace function private.dispatch_order(p_order_id uuid)
returns integer language plpgsql security definer set search_path = ''
as $$
declare v_order public.orders%rowtype; v_count integer; v_rate integer; v_version integer;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  select rate_basis_points,version into v_rate,v_version from public.commission_policies where id=1;
  if not found then raise exception 'Set the commission policy before dispatching orders'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status not in ('requested','quoted','searching') or v_order.driver_id is not null then
    raise exception 'Order is not ready for dispatch';
  end if;
  if v_order.delivery_quote_set_at is null then raise exception 'Set the delivery quote before dispatching'; end if;
  if v_order.commission_rate_basis_points is null then
    update public.orders set commission_rate_basis_points=v_rate,commission_policy_version=v_version where id=v_order.id
      returning * into v_order;
  end if;
  update public.order_offers set status='expired',responded_at=now() where order_id=v_order.id and status='pending';
  select count(*) into v_count
  from public.driver_profiles dp
  join public.user_roles ur on ur.user_id=dp.user_id and ur.role='driver'
  where dp.review_status='approved' and dp.is_online;
  if v_count=0 then raise exception 'No online approved drivers'; end if;
  insert into public.order_offers(order_id,driver_id,expires_at)
    select v_order.id,dp.user_id,now()+interval '90 seconds'
    from public.driver_profiles dp
    join public.user_roles ur on ur.user_id=dp.user_id and ur.role='driver'
    where dp.review_status='approved' and dp.is_online
    on conflict(order_id,driver_id) do update set status='pending',expires_at=excluded.expires_at,created_at=now(),responded_at=null
      where public.order_offers.status<>'accepted';
  update public.orders set status='searching' where id=v_order.id;
  insert into public.order_events(order_id,actor_id,event_type,details)
    values(v_order.id,auth.uid(),'offers_dispatched',jsonb_build_object(
      'eligible_driver_count',v_count,
      'commission_rate_basis_points',v_order.commission_rate_basis_points,
      'dispatch_mode','all_available_drivers',
      'commission_collection','after_delivery'
    ));
  return v_count;
end;
$$;

create or replace function private.notify_order_event()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_order public.orders%rowtype; v_title text; v_body text;
begin
  select * into v_order from public.orders where id=new.order_id;
  if not found then return new; end if;
  v_title:=case new.event_type
    when 'order_requested' then 'طلب جديد'
    when 'delivery_quote_set' then 'أجرة التوصيل جاهزة'
    when 'delivery_quote_approved' then 'وافق العميل على أجرة التوصيل'
    when 'delivery_quote_rejected' then 'رفض العميل أجرة التوصيل'
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
    when 'delivery_quote_set' then 'حدد فريق التشغيل أجرة التوصيل. افتح طلبك لمتابعة حالته.'
    when 'delivery_quote_approved' then 'وافق العميل على أجرة التوصيل. صار الطلب جاهزاً للتوزيع.'
    when 'delivery_quote_rejected' then 'رفض العميل أجرة التوصيل وأُلغي الطلب.'
    when 'offers_dispatched' then 'انرسل الطلب للسائقين المتاحين بدمشق وريفها.'
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
      and new.event_type in ('order_requested','delivery_quote_approved','delivery_quote_rejected','customer_cancelled','admin_cancelled','driver_declined_offer','cash_settled')
  ) targets
  where targets.recipient_id is not null and targets.recipient_id is distinct from new.actor_id
  on conflict(recipient_id,source_event_id) where source_event_id is not null do nothing;
  return new;
end;
$$;

revoke all on function private.notify_order_event() from public,anon,authenticated;
