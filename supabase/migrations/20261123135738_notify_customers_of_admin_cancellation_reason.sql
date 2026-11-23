-- Keep cancellation reasons in the admin timeline and send the admin-provided
-- reason to the customer in the same durable notification/push message.
create or replace function private.notify_order_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders%rowtype;
  v_title text;
  v_body text;
  v_customer_body text;
begin
  select * into v_order from public.orders where id = new.order_id;
  if not found then return new; end if;

  v_title := case new.event_type
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

  v_body := case new.event_type
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

  v_customer_body := case
    when new.event_type = 'admin_cancelled'
      and nullif(pg_catalog.btrim(new.details ->> 'reason'), '') is not null
      then pg_catalog.left('تم إلغاء طلبك من الإدارة. السبب: ' || pg_catalog.btrim(new.details ->> 'reason'), 300)
    else v_body
  end;

  insert into public.notifications(recipient_id, order_id, source_event_id, event_type, title, body)
  select targets.recipient_id, new.order_id, new.id, new.event_type, v_title,
    case when targets.recipient_id = v_order.customer_id then v_customer_body else v_body end
  from (
    select v_order.customer_id as recipient_id
    union select v_order.driver_id where v_order.driver_id is not null
    union select ur.user_id from public.user_roles ur where ur.role = 'super_admin'
      and new.event_type in ('order_requested', 'delivery_quote_approved', 'delivery_quote_rejected', 'customer_cancelled', 'admin_cancelled', 'driver_declined_offer', 'cash_settled')
  ) targets
  where targets.recipient_id is not null and targets.recipient_id is distinct from new.actor_id
  on conflict (recipient_id, source_event_id) where source_event_id is not null do nothing;
  return new;
end;
$$;
