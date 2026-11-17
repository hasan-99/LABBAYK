-- Direct assignment now sends a one-driver offer that the driver can accept or decline (10 minute window),
-- instead of assigning the order immediately.
create or replace function private.admin_price_and_dispatch_order(
  p_order_id uuid,
  p_fee_minor bigint,
  p_driver_id uuid,
  p_reason text
) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_rate integer;
  v_version integer;
  v_count integer := 0;
  v_previous_fee bigint;
  v_previous_status text;
  v_reason text := coalesce(nullif(trim(p_reason),''),'تحديد أجرة التوصيل');
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_fee_minor is null or p_fee_minor not between 0 and 100000000 then raise exception 'Invalid delivery quote'; end if;
  if char_length(coalesce(trim(p_reason),'')) > 500 then raise exception 'Reason is too long'; end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status not in ('requested','quoted','searching') or v_order.driver_id is not null then
    raise exception 'Order is not ready for pricing or dispatch';
  end if;
  select rate_basis_points,version into v_rate,v_version from public.commission_policies where id=1;
  if not found then raise exception 'Set the commission policy before dispatching orders'; end if;

  update public.order_offers set status='expired',responded_at=now()
    where order_id=p_order_id and status='pending';
  v_previous_fee := v_order.delivery_fee_minor;
  v_previous_status := v_order.status;
  update public.orders set delivery_fee_minor=p_fee_minor,base_fee_minor=0,zone_surcharge_minor=0,
    pricing_rule_version=0,delivery_quote_set_at=now(),delivery_quote_set_by=v_actor,
    commission_rate_basis_points=coalesce(commission_rate_basis_points,v_rate),
    commission_policy_version=coalesce(commission_policy_version,v_version),status='quoted'
    where id=p_order_id returning * into v_order;

  insert into public.order_events(order_id,actor_id,event_type,details)
    values(p_order_id,v_actor,'delivery_quote_set',jsonb_build_object(
      'delivery_fee_minor',p_fee_minor,'reason',v_reason,'customer_approval_required',false
    ));
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,reason,before_data,after_data)
    values(v_actor,'set_order_delivery_quote','order',p_order_id::text,v_reason,
      jsonb_build_object('delivery_fee_minor',v_previous_fee,'status',v_previous_status),
      jsonb_build_object('delivery_fee_minor',p_fee_minor,'dispatch_driver_id',p_driver_id));

  if p_driver_id is not null then
    if not exists (
      select 1 from public.driver_profiles dp
      join public.user_roles ur on ur.user_id=dp.user_id and ur.role='driver'
      where dp.user_id=p_driver_id and dp.review_status='approved' and dp.is_online
    ) then raise exception 'Selected driver is not available'; end if;
    insert into public.order_offers(order_id,driver_id,expires_at)
      values(p_order_id,p_driver_id,now()+interval '10 minutes')
      on conflict(order_id,driver_id) do update set status='pending',expires_at=excluded.expires_at,created_at=now(),responded_at=null
        where public.order_offers.status<>'accepted';
    update public.orders set status='searching' where id=p_order_id;
    insert into public.order_events(order_id,actor_id,event_type,details)
      values(p_order_id,v_actor,'offers_dispatched',jsonb_build_object(
        'eligible_driver_count',1,'commission_rate_basis_points',v_order.commission_rate_basis_points,
        'dispatch_mode','single_driver','driver_id',p_driver_id,'first_accept_wins',true
      ));
    insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,reason,before_data,after_data)
      values(v_actor,'offer_order_to_driver','order',p_order_id::text,v_reason,
        jsonb_build_object('status','quoted'),jsonb_build_object('status','searching','driver_id',p_driver_id));
    return 1;
  end if;

  select count(*) into v_count
  from public.driver_profiles dp
  join public.user_roles ur on ur.user_id=dp.user_id and ur.role='driver'
  where dp.review_status='approved' and dp.is_online;
  if v_count=0 then return 0; end if;

  insert into public.order_offers(order_id,driver_id,expires_at)
    select p_order_id,dp.user_id,now()+interval '10 minutes'
    from public.driver_profiles dp
    join public.user_roles ur on ur.user_id=dp.user_id and ur.role='driver'
    where dp.review_status='approved' and dp.is_online
    on conflict(order_id,driver_id) do update set status='pending',expires_at=excluded.expires_at,created_at=now(),responded_at=null
      where public.order_offers.status<>'accepted';
  update public.orders set status='searching' where id=p_order_id;
  insert into public.order_events(order_id,actor_id,event_type,details)
    values(p_order_id,v_actor,'offers_dispatched',jsonb_build_object(
      'eligible_driver_count',v_count,'commission_rate_basis_points',v_order.commission_rate_basis_points,
      'dispatch_mode','all_available_drivers','first_accept_wins',true
    ));
  return v_count;
end;
$$;
