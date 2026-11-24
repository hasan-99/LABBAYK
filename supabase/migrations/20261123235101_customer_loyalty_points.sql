-- Customer loyalty: one point for each completed delivery. Customers may redeem
-- three points for 20%, four for 30%, or five for 40% off the delivery fee. The discount
-- is computed only after admin pricing; customers never approve fees or purchases.

create table public.customer_loyalty_accounts (
  customer_id uuid primary key references auth.users(id) on delete cascade,
  points_balance integer not null default 0 check (points_balance >= 0),
  lifetime_points_earned integer not null default 0 check (lifetime_points_earned >= 0),
  updated_at timestamptz not null default now()
);
alter table public.customer_loyalty_accounts enable row level security;
create policy customer_loyalty_accounts_read on public.customer_loyalty_accounts
  for select to authenticated using (customer_id = (select auth.uid()) or (select private.is_admin()));
revoke all on public.customer_loyalty_accounts from public, anon, authenticated;
grant select on public.customer_loyalty_accounts to authenticated;

create table public.customer_loyalty_ledger (
  id bigint generated always as identity primary key,
  customer_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references public.orders(id) on delete restrict,
  event_type text not null check (event_type in ('earned','redeemed','refund')),
  points_delta integer not null check (points_delta <> 0),
  created_at timestamptz not null default now(),
  check ((event_type = 'redeemed' and points_delta < 0) or (event_type <> 'redeemed' and points_delta > 0))
);
create unique index customer_loyalty_ledger_order_event_uq
  on public.customer_loyalty_ledger(order_id,event_type) where order_id is not null;
create index customer_loyalty_ledger_customer_created_idx
  on public.customer_loyalty_ledger(customer_id,created_at desc,id desc);
alter table public.customer_loyalty_ledger enable row level security;
create policy customer_loyalty_ledger_read on public.customer_loyalty_ledger
  for select to authenticated using (customer_id = (select auth.uid()) or (select private.is_admin()));
revoke all on public.customer_loyalty_ledger from public, anon, authenticated;
grant select on public.customer_loyalty_ledger to authenticated;

alter table public.orders
  add column loyalty_points_redeemed integer not null default 0 check (loyalty_points_redeemed >= 0),
  add column loyalty_discount_tier_points integer not null default 0 check (loyalty_discount_tier_points in (0,3,4,5)),
  add column loyalty_discount_minor bigint not null default 0 check (loyalty_discount_minor >= 0);
alter table public.cash_settlements
  add column loyalty_discount_minor bigint not null default 0 check (loyalty_discount_minor >= 0);

-- The client no longer approves fees or purchase amounts. Normalize any
-- legacy orders still carrying the removed purchase-approval status.
update public.orders set status='shopping' where status='awaiting_approval';

create or replace function private.loyalty_discount_for(p_fee_minor bigint,p_points integer)
returns bigint language sql immutable set search_path = '' as $$
  select case p_points when 3 then floor(p_fee_minor * 0.20 + 0.5)::bigint
                       when 4 then floor(p_fee_minor * 0.30 + 0.5)::bigint
                       when 5 then floor(p_fee_minor * 0.40 + 0.5)::bigint
                       else 0::bigint end;
$$;
revoke all on function private.loyalty_discount_for(bigint,integer) from public, anon, authenticated;

create or replace function private.apply_loyalty_delivery_discount()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.loyalty_discount_minor := least(new.delivery_fee_minor,
    private.loyalty_discount_for(new.delivery_fee_minor,new.loyalty_discount_tier_points));
  return new;
end;
$$;
create trigger orders_apply_loyalty_discount
  before insert or update of delivery_fee_minor,loyalty_discount_tier_points on public.orders
  for each row execute function private.apply_loyalty_delivery_discount();
revoke all on function private.apply_loyalty_delivery_discount() from public, anon, authenticated;

create or replace function private.snapshot_settlement_loyalty_discount()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select o.loyalty_discount_minor into new.loyalty_discount_minor
  from public.orders o where o.id = new.order_id;
  return new;
end;
$$;
create trigger cash_settlements_snapshot_loyalty_discount
  before insert on public.cash_settlements
  for each row execute function private.snapshot_settlement_loyalty_discount();
revoke all on function private.snapshot_settlement_loyalty_discount() from public, anon, authenticated;

-- The default settlement amount must match the customer's discounted amount.
-- If the driver explicitly records collected cash, preserve that actual amount.
create or replace function private.settle_order_cash(p_order_id uuid,p_idempotency_key uuid,p_actor uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders%rowtype;
  v_balance bigint;
  v_commission bigint;
  v_collected bigint;
  v_settlement_id bigint;
  v_existing public.cash_settlements%rowtype;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  select * into v_existing from public.cash_settlements where idempotency_key=p_idempotency_key;
  if found then
    if v_existing.order_id<>p_order_id then raise exception 'Idempotency key was used for another order'; end if;
    return (select coalesce(sum(amount_minor),0) from public.driver_wallet_ledger where driver_id=v_existing.driver_id);
  end if;
  if v_order.status='settled' then
    if not exists(select 1 from public.cash_settlements s where s.order_id=p_order_id
      and not exists(select 1 from public.cash_settlement_reversals r where r.settlement_id=s.id))
    then raise exception 'Settled order is missing its active cash reconciliation'; end if;
    return (select coalesce(sum(amount_minor),0) from public.driver_wallet_ledger where driver_id=v_order.driver_id);
  end if;
  if v_order.status<>'delivered' or v_order.purchase_amount_minor is null or v_order.driver_id is null then
    raise exception 'Only a delivered order with recorded purchase cost can be settled';
  end if;
  if v_order.commission_rate_basis_points is null then raise exception 'Commission policy was not snapshotted for this order'; end if;
  if exists(select 1 from public.cash_settlements s where s.order_id=p_order_id
    and not exists(select 1 from public.cash_settlement_reversals r where r.settlement_id=s.id))
  then raise exception 'Order already has an active settlement'; end if;
  perform 1 from public.driver_profiles where user_id=v_order.driver_id for update;
  if not found then raise exception 'Driver wallet not found'; end if;
  select coalesce(sum(amount_minor),0) into v_balance from public.driver_wallet_ledger where driver_id=v_order.driver_id;
  v_commission:=floor(v_order.delivery_fee_minor*v_order.commission_rate_basis_points/10000.0+0.5)::bigint;
  v_collected:=coalesce(v_order.cash_collected_minor,
    v_order.purchase_amount_minor+v_order.delivery_fee_minor-v_order.loyalty_discount_minor);
  insert into public.cash_settlements(order_id,driver_id,idempotency_key,purchase_amount_minor,delivery_fee_minor,
      commission_rate_basis_points,commission_amount_minor,driver_earning_minor,cash_collected_minor,settled_by)
    values(p_order_id,v_order.driver_id,p_idempotency_key,v_order.purchase_amount_minor,v_order.delivery_fee_minor,
      v_order.commission_rate_basis_points,v_commission,v_order.delivery_fee_minor-v_commission,v_collected,p_actor)
    returning id into v_settlement_id;
  if v_commission>0 then
    insert into public.driver_wallet_ledger(driver_id,amount_minor,entry_type,idempotency_key,order_id,settlement_id,reason,actor_id)
      values(v_order.driver_id,-v_commission,'delivery_commission',p_idempotency_key,p_order_id,v_settlement_id,
        'عمولة توصيل مستحقة عن الطلب '||left(p_order_id::text,8),p_actor);
  end if;
  update public.orders set status='settled' where id=p_order_id;
  insert into public.order_events(order_id,actor_id,event_type,details)
    values(p_order_id,p_actor,'cash_settled',jsonb_build_object('settlement_id',v_settlement_id,
      'purchase_amount_minor',v_order.purchase_amount_minor,'delivery_fee_minor',v_order.delivery_fee_minor,
      'loyalty_discount_minor',v_order.loyalty_discount_minor,'cash_collected_minor',v_collected,
      'commission_minor',v_commission,'commission_collection','driver_pays_admin_after_delivery',
      'commission_due_after_settlement',greatest(0,-(v_balance-v_commission)),
      'driver_earning_minor',v_order.delivery_fee_minor-v_commission));
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,reason,before_data,after_data)
    values(p_actor,'settle_cash_order','order',p_order_id::text,'تسوية تلقائية عند تسليم الطلب',
      jsonb_build_object('status','delivered'),jsonb_build_object('status','settled','settlement_id',v_settlement_id,
        'customer_cash_collected_minor',v_collected,'loyalty_discount_minor',v_order.loyalty_discount_minor,
        'commission_minor',v_commission,'driver_earning_minor',v_order.delivery_fee_minor-v_commission,
        'idempotency_key',p_idempotency_key));
  return v_balance-v_commission;
end;
$$;
revoke all on function private.settle_order_cash(uuid,uuid,uuid) from public,anon,authenticated;

create or replace function private.create_customer_order(
  p_idempotency_key uuid,
  p_address_id uuid,
  p_request_text text,
  p_is_urgent boolean,
  p_loyalty_discount_tier_points integer
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_customer_id uuid := auth.uid();
  v_address public.addresses%rowtype;
  v_governorate text;
  v_order_id uuid;
  v_balance integer;
  v_points_to_consume integer;
begin
  if v_customer_id is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null then raise exception 'Request key is required'; end if;
  if p_request_text is null or char_length(trim(p_request_text)) not between 1 and 4000 then raise exception 'Invalid request'; end if;
  if p_loyalty_discount_tier_points is null or p_loyalty_discount_tier_points not in (0,3,4,5) then raise exception 'Choose 0, 3, 4, or 5 loyalty points'; end if;

  select id into v_order_id from public.orders
    where customer_id=v_customer_id and idempotency_key=p_idempotency_key;
  if v_order_id is not null then
    if not exists(select 1 from public.orders o where o.id=v_order_id and o.address_id=p_address_id
      and o.request_text=trim(p_request_text) and o.is_urgent=coalesce(p_is_urgent,false)
      and o.loyalty_discount_tier_points=p_loyalty_discount_tier_points) then
      raise exception 'Idempotency key reused with different order data';
    end if;
    return v_order_id;
  end if;

  select * into v_address from public.addresses where id=p_address_id and user_id=v_customer_id;
  if not found then raise exception 'Address not found'; end if;
  v_governorate := lower(btrim(v_address.governorate));
  if v_governorate not in ('دمشق','محافظة دمشق','damascus','ريف دمشق','محافظة ريف دمشق','rif dimashq','rif dimashq governorate') then
    raise exception 'Delivery is currently available only in Damascus and Rif Dimashq';
  end if;

  insert into public.customer_loyalty_accounts(customer_id) values(v_customer_id) on conflict(customer_id) do nothing;
  select points_balance into v_balance from public.customer_loyalty_accounts where customer_id=v_customer_id for update;
  -- Another identical submission may have committed while this request waited for the balance lock.
  select id into v_order_id from public.orders where customer_id=v_customer_id and idempotency_key=p_idempotency_key;
  if v_order_id is not null then
    if not exists(select 1 from public.orders o where o.id=v_order_id and o.address_id=p_address_id
      and o.request_text=trim(p_request_text) and o.is_urgent=coalesce(p_is_urgent,false)
      and o.loyalty_discount_tier_points=p_loyalty_discount_tier_points) then
      raise exception 'Idempotency key reused with different order data';
    end if;
    return v_order_id;
  end if;
  if v_balance < p_loyalty_discount_tier_points then raise exception 'Not enough loyalty points'; end if;
  v_points_to_consume := case when p_loyalty_discount_tier_points > 0 then v_balance else 0 end;

  insert into public.orders (
    customer_id,address_id,zone_id,idempotency_key,request_text,delivery_fee_minor,
    base_fee_minor,zone_surcharge_minor,pricing_rule_version,is_urgent,
    loyalty_points_redeemed,loyalty_discount_tier_points
  ) values (
    v_customer_id,v_address.id,null,p_idempotency_key,trim(p_request_text),0,
    0,0,0,coalesce(p_is_urgent,false),v_points_to_consume,p_loyalty_discount_tier_points
  ) on conflict(customer_id,idempotency_key) do nothing returning id into v_order_id;

  if v_order_id is null then
    select id into v_order_id from public.orders where customer_id=v_customer_id and idempotency_key=p_idempotency_key
      and address_id=v_address.id and request_text=trim(p_request_text) and is_urgent=coalesce(p_is_urgent,false)
      and loyalty_discount_tier_points=p_loyalty_discount_tier_points;
    if v_order_id is null then raise exception 'Idempotency key reused with different order data'; end if;
    return v_order_id;
  end if;

  if v_points_to_consume > 0 then
    update public.customer_loyalty_accounts set points_balance=points_balance-v_points_to_consume,updated_at=now()
      where customer_id=v_customer_id;
    insert into public.customer_loyalty_ledger(customer_id,order_id,event_type,points_delta)
      values(v_customer_id,v_order_id,'redeemed',-v_points_to_consume);
  end if;
  insert into public.order_events(order_id,actor_id,event_type,details)
    values(v_order_id,v_customer_id,'order_requested',jsonb_build_object(
      'delivery_quote_status','pending','pricing_mode','admin_set','is_urgent',coalesce(p_is_urgent,false),
      'loyalty_points_redeemed',v_points_to_consume,
      'loyalty_discount_tier_points',p_loyalty_discount_tier_points
    ));
  return v_order_id;
end;
$$;
revoke all on function private.create_customer_order(uuid,uuid,text,boolean,integer) from public,anon;
grant execute on function private.create_customer_order(uuid,uuid,text,boolean,integer) to authenticated;

create or replace function public.create_customer_order(
  p_idempotency_key uuid,p_address_id uuid,p_request_text text,p_is_urgent boolean,p_loyalty_discount_tier_points integer
) returns uuid language sql security invoker set search_path = '' as $$
  select private.create_customer_order($1,$2,$3,$4,$5);
$$;
revoke all on function public.create_customer_order(uuid,uuid,text,boolean,integer) from public,anon;
grant execute on function public.create_customer_order(uuid,uuid,text,boolean,integer) to authenticated;

create or replace function private.apply_customer_loyalty_status_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_inserted integer; v_event_id bigint;
begin
  if old.status is distinct from new.status and new.status in ('delivered','settled') and new.customer_id is not null then
    insert into public.customer_loyalty_accounts(customer_id) values(new.customer_id) on conflict(customer_id) do nothing;
    insert into public.customer_loyalty_ledger(customer_id,order_id,event_type,points_delta)
      values(new.customer_id,new.id,'earned',1) on conflict(order_id,event_type) where order_id is not null do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted > 0 then
      update public.customer_loyalty_accounts set points_balance=points_balance+1,
        lifetime_points_earned=lifetime_points_earned+1,updated_at=now() where customer_id=new.customer_id;
      insert into public.order_events(order_id,actor_id,event_type,details)
        values(new.id,new.driver_id,'loyalty_point_earned',jsonb_build_object('points',1)) returning id into v_event_id;
      update public.notifications set title='كسبت نقطة لَبّيك',body='أضفنا نقطة إلى رصيدك بعد اكتمال الطلب.'
        where recipient_id=new.customer_id and source_event_id=v_event_id;
    end if;
  end if;
  if old.status is distinct from new.status and new.status='cancelled' and new.loyalty_points_redeemed>0 and new.customer_id is not null then
    insert into public.customer_loyalty_accounts(customer_id) values(new.customer_id) on conflict(customer_id) do nothing;
    insert into public.customer_loyalty_ledger(customer_id,order_id,event_type,points_delta)
      values(new.customer_id,new.id,'refund',new.loyalty_points_redeemed)
      on conflict(order_id,event_type) where order_id is not null do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted > 0 then
      update public.customer_loyalty_accounts set points_balance=points_balance+new.loyalty_points_redeemed,updated_at=now()
        where customer_id=new.customer_id;
      insert into public.order_events(order_id,actor_id,event_type,details)
        values(new.id,auth.uid(),'loyalty_points_refunded',jsonb_build_object('points',new.loyalty_points_redeemed)) returning id into v_event_id;
      insert into public.notifications(recipient_id,order_id,source_event_id,event_type,title,body)
        values(new.customer_id,new.id,v_event_id,'loyalty_points_refunded','رجعت نقاطك إلى رصيدك','أعدنا نقاط لَبّيك المستخدمة لأن الطلب أُلغي.')
        on conflict(recipient_id,source_event_id) where source_event_id is not null
        do update set title=excluded.title,body=excluded.body;
    end if;
  end if;
  return new;
end;
$$;
create trigger orders_apply_customer_loyalty
  after update of status on public.orders
  for each row execute function private.apply_customer_loyalty_status_change();
revoke all on function private.apply_customer_loyalty_status_change() from public,anon,authenticated;

drop function public.get_cash_reconciliation(timestamptz,timestamptz);
drop function private.get_cash_reconciliation(timestamptz,timestamptz);
create function private.get_cash_reconciliation(p_from timestamptz,p_to timestamptz)
returns table(settlement_count bigint,purchase_total_minor bigint,delivery_fee_total_minor bigint,
  loyalty_discount_total_minor bigint,commission_total_minor bigint,driver_earning_total_minor bigint,cash_collected_total_minor bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_from is null or p_to is null or p_to<=p_from or p_to-p_from>interval '366 days' then
    raise exception 'A valid date range up to 366 days is required';
  end if;
  return query select count(*)::bigint,coalesce(sum(s.purchase_amount_minor),0)::bigint,
    coalesce(sum(s.delivery_fee_minor),0)::bigint,coalesce(sum(s.loyalty_discount_minor),0)::bigint,
    coalesce(sum(s.commission_amount_minor),0)::bigint,coalesce(sum(s.driver_earning_minor),0)::bigint,
    coalesce(sum(s.cash_collected_minor),0)::bigint
  from public.cash_settlements s
  where s.created_at>=p_from and s.created_at<p_to
    and not exists(select 1 from public.cash_settlement_reversals r where r.settlement_id=s.id);
end;
$$;
revoke all on function private.get_cash_reconciliation(timestamptz,timestamptz) from public,anon;
grant execute on function private.get_cash_reconciliation(timestamptz,timestamptz) to authenticated;
create function public.get_cash_reconciliation(p_from timestamptz,p_to timestamptz)
returns table(settlement_count bigint,purchase_total_minor bigint,delivery_fee_total_minor bigint,
  loyalty_discount_total_minor bigint,commission_total_minor bigint,driver_earning_total_minor bigint,cash_collected_total_minor bigint)
language sql stable security invoker set search_path = '' as $$
  select * from private.get_cash_reconciliation($1,$2);
$$;
revoke all on function public.get_cash_reconciliation(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.get_cash_reconciliation(timestamptz,timestamptz) to authenticated;
