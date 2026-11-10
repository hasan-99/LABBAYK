alter table public.orders
  add column delivery_quote_set_at timestamptz,
  add column delivery_quote_set_by uuid references auth.users(id) on delete set null,
  add column delivery_quote_approved_at timestamptz,
  add constraint orders_quote_approval_requires_quote
    check (delivery_quote_approved_at is null or delivery_quote_set_at is not null),
  add constraint orders_quoted_status_requires_quote
    check (status <> 'quoted' or delivery_quote_set_at is not null);

grant select (delivery_quote_set_at, delivery_quote_set_by, delivery_quote_approved_at)
  on public.orders to authenticated;

create or replace function private.create_customer_order(
  p_idempotency_key uuid,
  p_address_id uuid,
  p_category text,
  p_request_text text,
  p_budget_ceiling_minor bigint
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_customer_id uuid := auth.uid();
  v_address public.addresses%rowtype;
  v_zone public.service_zones%rowtype;
  v_order_id uuid;
begin
  if v_customer_id is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null then raise exception 'Request key is required'; end if;
  if p_category is null or char_length(trim(p_category)) not between 1 and 80 then raise exception 'Invalid category'; end if;
  if p_request_text is null or char_length(trim(p_request_text)) not between 1 and 4000 then raise exception 'Invalid request'; end if;
  if p_budget_ceiling_minor is null or p_budget_ceiling_minor not between 1 and 100000000 then raise exception 'A valid purchase budget is required'; end if;

  select * into v_address from public.addresses where id = p_address_id and user_id = v_customer_id;
  if not found then raise exception 'Address not found'; end if;
  select * into v_zone from public.service_zones where id = v_address.zone_id and active;
  if not found then raise exception 'Delivery zone is inactive'; end if;

  insert into public.orders (
    customer_id,address_id,zone_id,idempotency_key,category,request_text,delivery_fee_minor,
    budget_ceiling_minor,base_fee_minor,zone_surcharge_minor,pricing_rule_version
  ) values (
    v_customer_id,v_address.id,v_zone.id,p_idempotency_key,trim(p_category),trim(p_request_text),0,
    p_budget_ceiling_minor,0,0,0
  )
  on conflict (customer_id,idempotency_key) do nothing returning id into v_order_id;

  if v_order_id is null then
    select id into v_order_id from public.orders
    where customer_id = v_customer_id and idempotency_key = p_idempotency_key
      and address_id = v_address.id and category = trim(p_category)
      and request_text = trim(p_request_text) and budget_ceiling_minor = p_budget_ceiling_minor;
    if v_order_id is null then raise exception 'Idempotency key reused with different order data'; end if;
  else
    insert into public.order_events(order_id,actor_id,event_type,details)
    values (v_order_id,v_customer_id,'order_requested',jsonb_build_object(
      'budget_ceiling_minor',p_budget_ceiling_minor,
      'delivery_quote_status','pending',
      'pricing_mode','manual_road_distance'
    ));
  end if;
  return v_order_id;
end;
$$;

create function private.set_order_delivery_quote(p_order_id uuid,p_fee_minor bigint,p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_order public.orders%rowtype;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_fee_minor is null or p_fee_minor not between 0 and 100000000 then raise exception 'Invalid delivery quote'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 5 and 500 then raise exception 'A reason is required'; end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status not in ('requested','quoted') or v_order.driver_id is not null then
    raise exception 'Delivery quote can only be set before dispatch';
  end if;
  if v_order.delivery_quote_approved_at is not null then raise exception 'Customer already approved the delivery quote'; end if;

  update public.orders set delivery_fee_minor=p_fee_minor,status='quoted',
    base_fee_minor=0,zone_surcharge_minor=0,pricing_rule_version=0,
    delivery_quote_set_at=now(),delivery_quote_set_by=v_actor
    where id=p_order_id;

  insert into public.order_events(order_id,actor_id,event_type,details)
  values(p_order_id,v_actor,'delivery_quote_set',jsonb_build_object('delivery_fee_minor',p_fee_minor,'reason',trim(p_reason)));
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,reason,before_data,after_data)
  values(v_actor,'set_order_delivery_quote','order',p_order_id::text,trim(p_reason),
    jsonb_build_object('delivery_fee_minor',v_order.delivery_fee_minor,'status',v_order.status),
    jsonb_build_object('delivery_fee_minor',p_fee_minor,'status','quoted','basis','manual_road_distance'));
end;
$$;

create function private.respond_delivery_quote(p_order_id uuid,p_approved boolean)
returns text language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_order public.orders%rowtype; v_next_status text;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if p_approved is null then raise exception 'A quote decision is required'; end if;
  select * into v_order from public.orders where id=p_order_id and customer_id=v_actor for update;
  if not found then raise exception 'Customer order not found'; end if;
  if v_order.status<>'quoted' or v_order.delivery_quote_set_at is null then raise exception 'No delivery quote is awaiting approval'; end if;

  if p_approved then
    v_next_status:='requested';
    update public.orders set status=v_next_status,delivery_quote_approved_at=now() where id=p_order_id;
    insert into public.order_events(order_id,actor_id,event_type,details)
    values(p_order_id,v_actor,'delivery_quote_approved',jsonb_build_object('delivery_fee_minor',v_order.delivery_fee_minor));
    return 'approved';
  end if;

  v_next_status:='cancelled';
  update public.orders set status=v_next_status where id=p_order_id;
  insert into public.order_events(order_id,actor_id,event_type,details)
  values(p_order_id,v_actor,'delivery_quote_rejected',jsonb_build_object('delivery_fee_minor',v_order.delivery_fee_minor));
  return 'rejected';
end;
$$;

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
  if v_order.status not in ('requested','searching') or v_order.driver_id is not null then raise exception 'Order is not ready for dispatch'; end if;
  if v_order.delivery_quote_set_at is null or v_order.delivery_quote_approved_at is null then
    raise exception 'Customer approval of the delivery quote is required';
  end if;
  if v_order.commission_rate_basis_points is null then
    update public.orders set commission_rate_basis_points=v_rate,commission_policy_version=v_version where id=v_order.id
      returning * into v_order;
  end if;
  update public.order_offers set status='expired',responded_at=now() where order_id=v_order.id and status='pending';
  select count(*) into v_count from public.driver_profiles dp where dp.service_zone_id=v_order.zone_id and dp.review_status='approved' and dp.is_online
    and coalesce((select sum(l.amount_minor) from public.driver_wallet_ledger l where l.driver_id=dp.user_id),0)
      >= floor(v_order.delivery_fee_minor*v_order.commission_rate_basis_points/10000.0+0.5)::bigint;
  if v_count=0 then raise exception 'No online approved drivers with enough wallet balance in this zone'; end if;
  insert into public.order_offers(order_id,driver_id,expires_at)
    select v_order.id,dp.user_id,now()+interval '90 seconds' from public.driver_profiles dp
    where dp.service_zone_id=v_order.zone_id and dp.review_status='approved' and dp.is_online
      and coalesce((select sum(l.amount_minor) from public.driver_wallet_ledger l where l.driver_id=dp.user_id),0)
        >= floor(v_order.delivery_fee_minor*v_order.commission_rate_basis_points/10000.0+0.5)::bigint
    on conflict(order_id,driver_id) do update set status='pending',expires_at=excluded.expires_at,created_at=now(),responded_at=null
      where public.order_offers.status<>'accepted';
  update public.orders set status='searching' where id=v_order.id;
  insert into public.order_events(order_id,actor_id,event_type,details)
    values(v_order.id,auth.uid(),'offers_dispatched',jsonb_build_object('eligible_driver_count',v_count,'commission_rate_basis_points',v_order.commission_rate_basis_points));
  return v_count;
end;
$$;

create or replace function private.cancel_customer_order(p_order_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid:=auth.uid(); v_order public.orders%rowtype;
begin
  if p_reason is null or char_length(trim(p_reason)) not between 3 and 300 then raise exception 'A cancellation reason is required'; end if;
  select * into v_order from public.orders where id=p_order_id and customer_id=v_actor for update;
  if not found then raise exception 'Customer order not found'; end if;
  if v_order.status not in ('requested','quoted','searching','accepted','assigned','shopping','awaiting_approval')
     or (v_order.status='shopping' and v_order.purchase_amount_minor is not null) then raise exception 'Order cannot be cancelled in its current state'; end if;
  update public.order_offers set status='revoked',responded_at=coalesce(responded_at,now())
    where order_id=p_order_id and status in ('pending','accepted');
  update public.orders set status='cancelled',driver_id=null,purchase_amount_minor=null,purchase_approved_at=null where id=p_order_id;
  insert into public.order_events(order_id,actor_id,event_type,details)
  values(p_order_id,v_actor,'customer_cancelled',jsonb_build_object('reason',trim(p_reason),'previous_status',v_order.status));
end;
$$;

create or replace function private.cancel_admin_order(p_order_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid:=auth.uid(); v_order public.orders%rowtype;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 5 and 500 then raise exception 'A cancellation reason is required'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status not in ('requested','quoted','searching','accepted','assigned','shopping','awaiting_approval')
     or (v_order.status='shopping' and v_order.purchase_amount_minor is not null) then raise exception 'Order requires a dispute instead of cancellation'; end if;
  update public.order_offers set status='revoked',responded_at=coalesce(responded_at,now())
    where order_id=p_order_id and status in ('pending','accepted');
  update public.orders set status='cancelled',driver_id=null,purchase_amount_minor=null,purchase_approved_at=null where id=p_order_id;
  insert into public.order_events(order_id,actor_id,event_type,details)
  values(p_order_id,v_actor,'admin_cancelled',jsonb_build_object('reason',trim(p_reason),'previous_status',v_order.status));
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,reason,before_data,after_data)
  values(v_actor,'cancel_order','order',p_order_id::text,trim(p_reason),jsonb_build_object('status',v_order.status),jsonb_build_object('status','cancelled'));
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
    when 'delivery_quote_set' then 'حدد فريق التشغيل أجرة التوصيل حسب مسافة الطريق. راجع المبلغ قبل الموافقة.'
    when 'delivery_quote_approved' then 'وافق العميل على أجرة التوصيل. صار الطلب جاهزاً للتوزيع.'
    when 'delivery_quote_rejected' then 'رفض العميل أجرة التوصيل وأُلغي الطلب.'
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
      and new.event_type in ('order_requested','delivery_quote_approved','delivery_quote_rejected','customer_cancelled','admin_cancelled','driver_declined_offer','cash_settled')
  ) targets
  where targets.recipient_id is not null and targets.recipient_id is distinct from new.actor_id
  on conflict(recipient_id,source_event_id) where source_event_id is not null do nothing;
  return new;
end;
$$;

revoke all on function private.set_order_delivery_quote(uuid,bigint,text) from public,anon;
revoke all on function private.respond_delivery_quote(uuid,boolean) from public,anon;
grant execute on function private.set_order_delivery_quote(uuid,bigint,text) to authenticated;
grant execute on function private.respond_delivery_quote(uuid,boolean) to authenticated;

create function public.set_order_delivery_quote(p_order_id uuid,p_fee_minor bigint,p_reason text)
returns void language sql security invoker set search_path = '' as $$ select private.set_order_delivery_quote($1,$2,$3); $$;
create function public.respond_delivery_quote(p_order_id uuid,p_approved boolean)
returns text language sql security invoker set search_path = '' as $$ select private.respond_delivery_quote($1,$2); $$;
revoke all on function public.set_order_delivery_quote(uuid,bigint,text) from public,anon;
revoke all on function public.respond_delivery_quote(uuid,boolean) from public,anon;
grant execute on function public.set_order_delivery_quote(uuid,bigint,text) to authenticated;
grant execute on function public.respond_delivery_quote(uuid,boolean) to authenticated;
