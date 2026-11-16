-- Run through Supabase SQL Editor / execute_sql against the linked project.
-- All fixtures and state changes are inside one transaction and are rolled back.
begin;

do $$
declare
  v_admin uuid;
  v_customer uuid;
  v_driver uuid;
  v_driver_review_status text;
  v_address uuid;
  v_order uuid;
  v_retry_order uuid;
  v_offer uuid;
  v_code text;
  v_status text;
  v_dispatch_count integer;
  v_expected_rejection integer;
  v_wallet_before bigint;
  v_wallet_after bigint;
  v_settlement_id bigint;
  v_new_settlement_id bigint;
  v_reversal_key uuid := gen_random_uuid();
  v_dispute_id uuid;
  v_reconciliation record;
begin
  select ur.user_id into v_admin
  from public.user_roles ur join auth.users u on u.id=ur.user_id
  where ur.role='super_admin' and u.email='hasan.cy99@gmail.com'
  limit 1;
  select ur.user_id into v_customer
  from public.user_roles ur join auth.users u on u.id=ur.user_id
  where ur.role='customer'
    and u.email='hasan.cy99+labbayk-qa-customer@gmail.com'
    and not exists(select 1 from public.user_roles a where a.user_id=ur.user_id and a.role='super_admin')
    and not exists(select 1 from public.driver_profiles d where d.user_id=ur.user_id)
  limit 1;
  select dp.user_id,dp.review_status into v_driver,v_driver_review_status
  from public.driver_profiles dp join auth.users u on u.id=dp.user_id
  where u.email='hasan.cy99+labbayk-qa-driver@gmail.com';
  if v_admin is null or v_customer is null or v_driver is null then
    raise exception 'QA prerequisites missing: expected the dedicated admin, customer, and driver accounts';
  end if;
  if v_driver_review_status not in ('pending','approved') then
    raise exception 'QA driver must be pending or approved before scenario tests';
  end if;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin::text,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  if v_driver_review_status='pending' then
    perform public.review_driver_application(v_driver,true);
  end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_driver::text,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_driver::text,true);
  update public.driver_profiles set service_zone_id=null where user_id=v_driver;
  update public.driver_profiles set is_online=true where user_id=v_driver;
  insert into public.addresses(user_id,zone_id,label,governorate,city,neighborhood,street,contact_phone,is_default)
  values(v_customer,null,'QA rollback','ريف دمشق','جرمانا','حارة الاختبار','شارع التجربة','0990000000',false)
  returning id into v_address;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin::text,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  select coalesce(sum(amount_minor),0) into v_wallet_before
  from public.driver_wallet_ledger where driver_id=v_driver;

  -- Scenario 1: quote approval, declined offer retry, under-budget purchase, COD, and 40% commission.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_customer::text,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  v_order := public.create_customer_order(gen_random_uuid(),v_address,'بقالة','طلب تجريبي ضمن السقف',100000);
  v_retry_order := public.create_customer_order(
    (select idempotency_key from public.orders where id=v_order),v_address,'بقالة','طلب تجريبي ضمن السقف',100000);
  if v_order<>v_retry_order then raise exception 'Scenario 1 failed: identical retry was not idempotent'; end if;
  if exists(select 1 from public.orders where id=v_order and zone_id is not null) then
    raise exception 'Scenario 1 failed: new customer order still depends on a zone';
  end if;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin::text,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform public.set_order_delivery_quote(v_order,20000,'مسافة طريق اختبارية');
  v_expected_rejection:=0;
  begin
    perform public.dispatch_order(v_order);
    v_expected_rejection:=1;
  exception when others then
    v_expected_rejection:=-1;
  end;
  if v_expected_rejection<>-1 then raise exception 'Scenario 1 failed: dispatch succeeded before customer quote approval'; end if;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_customer::text,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  if public.respond_delivery_quote(v_order,true)<>'approved' then raise exception 'Scenario 1 failed: quote approval'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin::text,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  v_dispatch_count:=public.dispatch_order(v_order);
  if v_dispatch_count<1 then raise exception 'Scenario 1 failed: expected at least one available driver offer'; end if;
  if v_dispatch_count<>(select count(*) from public.order_offers where order_id=v_order and status='pending') then
    raise exception 'Scenario 1 failed: not every eligible online driver received an offer';
  end if;
  select id into v_offer from public.order_offers where order_id=v_order and driver_id=v_driver and status='pending';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_driver::text,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_driver::text,true);
  perform public.decline_order_offer(v_offer);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin::text,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  if public.dispatch_order(v_order)<1 then raise exception 'Scenario 1 failed: declined offer could not be reissued'; end if;
  select id into v_offer from public.order_offers where order_id=v_order and driver_id=v_driver and status='pending';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_driver::text,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_driver::text,true);
  perform public.accept_order_offer(v_offer);
  perform public.start_order_shopping(v_order);
  v_status:=public.record_order_purchase(v_order,100000);
  if v_status<>'shopping' then raise exception 'Scenario 1 failed: within-budget purchase was blocked'; end if;
  perform public.confirm_order_purchase(v_order);
  perform public.start_order_delivery(v_order);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_customer::text,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  select code into v_code from public.issue_delivery_code(v_order);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_driver::text,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_driver::text,true);
  if not public.confirm_order_delivery(v_order,v_code) then raise exception 'Scenario 1 failed: valid delivery code rejected'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin::text,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  v_wallet_after:=public.settle_cash_order(v_order,gen_random_uuid());
  select id into v_settlement_id from public.cash_settlements where order_id=v_order;
  if not exists(select 1 from public.cash_settlements where id=v_settlement_id and purchase_amount_minor=100000
      and delivery_fee_minor=20000 and commission_rate_basis_points=4000 and commission_amount_minor=8000
      and driver_earning_minor=12000 and cash_collected_minor=120000) then
    raise exception 'Scenario 1 failed: COD / 40 percent settlement arithmetic';
  end if;
  if v_wallet_after<>v_wallet_before-8000 then raise exception 'Scenario 1 failed: commission was not recorded as payable after delivery'; end if;

  -- Scenario 2: customer rejects the manual road-distance quote before dispatch.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_customer::text,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  v_order:=public.create_customer_order(gen_random_uuid(),v_address,'صيدلية','اختبار رفض أجرة التوصيل',100000);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin::text,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform public.set_order_delivery_quote(v_order,15000,'مسافة طريق اختبارية');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_customer::text,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  if public.respond_delivery_quote(v_order,false)<>'rejected' then raise exception 'Scenario 2 failed: quote rejection'; end if;
  if not exists(select 1 from public.orders where id=v_order and status='cancelled')
      or exists(select 1 from public.order_offers where order_id=v_order) then
    raise exception 'Scenario 2 failed: rejected quote was dispatched';
  end if;

  -- Scenario 3: customer refuses an over-budget purchase and cancels without settlement.
  v_order:=public.create_customer_order(gen_random_uuid(),v_address,'بقالة','اختبار رفض زيادة المشتريات',100000);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin::text,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform public.set_order_delivery_quote(v_order,10000,'مسافة طريق اختبارية');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_customer::text,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  perform public.respond_delivery_quote(v_order,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin::text,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform public.dispatch_order(v_order);
  select id into v_offer from public.order_offers where order_id=v_order and driver_id=v_driver and status='pending';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_driver::text,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_driver::text,true);
  perform public.accept_order_offer(v_offer);
  if (select coalesce(sum(amount_minor),0) from public.driver_wallet_ledger where driver_id=v_driver)>=0 then
    raise exception 'Scenario 3 failed: prior delivery did not leave commission payable';
  end if;
  perform public.start_order_shopping(v_order);
  if public.record_order_purchase(v_order,120000)<>'awaiting_approval' then raise exception 'Scenario 3 failed: overspend did not require approval'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_customer::text,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  perform public.respond_purchase_approval(v_order,false);
  perform public.cancel_customer_order(v_order,'الشراء أغلى من السقف');
  if not exists(select 1 from public.orders where id=v_order and status='cancelled' and purchase_amount_minor is null)
      or exists(select 1 from public.cash_settlements where order_id=v_order) then
    raise exception 'Scenario 3 failed: refused overspend was charged or unsettled';
  end if;

  -- Scenario 4: customer approves the over-budget proposal; delivery and COD can then finish.
  v_order:=public.create_customer_order(gen_random_uuid(),v_address,'مستلزمات منزل','اختبار موافقة زيادة المشتريات',100000);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin::text,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform public.set_order_delivery_quote(v_order,10000,'مسافة طريق اختبارية');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_customer::text,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  perform public.respond_delivery_quote(v_order,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin::text,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform public.dispatch_order(v_order);
  select id into v_offer from public.order_offers where order_id=v_order and driver_id=v_driver and status='pending';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_driver::text,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_driver::text,true);
  perform public.accept_order_offer(v_offer);
  perform public.start_order_shopping(v_order);
  if public.record_order_purchase(v_order,120000)<>'awaiting_approval' then raise exception 'Scenario 4 failed: approval gate'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_customer::text,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  perform public.respond_purchase_approval(v_order,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_driver::text,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_driver::text,true);
  perform public.confirm_order_purchase(v_order);
  perform public.start_order_delivery(v_order);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_customer::text,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  select code into v_code from public.issue_delivery_code(v_order);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_driver::text,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_driver::text,true);
  if not public.confirm_order_delivery(v_order,v_code) then raise exception 'Scenario 4 failed: delivery code'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin::text,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform public.settle_cash_order(v_order,gen_random_uuid());
  if not exists(select 1 from public.orders where id=v_order and status='settled' and purchase_amount_minor=120000)
      or not exists(select 1 from public.cash_settlements where order_id=v_order and commission_amount_minor=4000
        and driver_earning_minor=6000 and cash_collected_minor=130000) then
    raise exception 'Scenario 4 failed: approved over-budget COD settlement';
  end if;

  -- Scenario 5: settlement reversal is replay-safe, reconciliation excludes it, and disputes resolve.
  perform public.reverse_cash_settlement(v_settlement_id,'تصحيح اختبار مؤقت',v_reversal_key);
  v_wallet_after:=public.reverse_cash_settlement(v_settlement_id,'تصحيح اختبار مؤقت',v_reversal_key);
  if v_wallet_after<>v_wallet_before-4000 then raise exception 'Scenario 5 failed: reversal replay changed the commission due'; end if;
  if not exists(select 1 from public.orders where id=(select order_id from public.cash_settlements where id=v_settlement_id) and status='delivered') then
    raise exception 'Scenario 5 failed: reversed order was not reopened';
  end if;
  perform public.settle_cash_order((select order_id from public.cash_settlements where id=v_settlement_id),gen_random_uuid());
  select id into v_new_settlement_id from public.cash_settlements
    where order_id=(select order_id from public.cash_settlements where id=v_settlement_id) and id<>v_settlement_id;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_customer::text,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_customer::text,true);
  v_dispute_id:=public.open_order_dispute(
    (select order_id from public.cash_settlements where id=v_new_settlement_id),
    'تسوية نقدية','مراجعة تسوية الاختبار',gen_random_uuid());
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin::text,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform public.resolve_order_dispute(v_dispute_id,'تمت مراجعة بيانات التسوية التجريبية');
  if not exists(select 1 from public.orders where id=(select order_id from public.cash_settlements where id=v_new_settlement_id) and status='settled') then
    raise exception 'Scenario 5 failed: resolved dispute did not restore previous order state';
  end if;
  select * into v_reconciliation from public.get_cash_reconciliation(now()-interval '1 day',now()+interval '1 day');
  if v_reconciliation.settlement_count<>2 or v_reconciliation.commission_total_minor<>12000
      or v_reconciliation.driver_earning_total_minor<>18000 then
    raise exception 'Scenario 5 failed: reconciliation totals do not exclude reversed settlement';
  end if;
end;
$$;

rollback;
