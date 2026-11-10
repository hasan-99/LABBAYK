create table public.commission_policies (
  id smallint primary key default 1 check (id=1),
  rate_basis_points integer not null check (rate_basis_points between 0 and 5000),
  version integer not null check (version > 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.commission_policies enable row level security;
create policy commission_policies_admin_select on public.commission_policies
  for select to authenticated using ((select private.is_admin()));
revoke all on public.commission_policies from public,anon,authenticated;
grant select on public.commission_policies to authenticated;

alter table public.orders
  add column commission_rate_basis_points integer check (commission_rate_basis_points between 0 and 5000),
  add column commission_policy_version integer check (commission_policy_version > 0);
alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('requested','quoted','searching','accepted','assigned','shopping','awaiting_approval','purchased','delivering','delivered','settled','cancelled'));
grant select (commission_rate_basis_points,commission_policy_version) on public.orders to authenticated;

create table public.driver_wallet_ledger (
  id bigint generated always as identity primary key,
  driver_id uuid not null references public.driver_profiles(user_id) on delete restrict,
  amount_minor bigint not null check (amount_minor <> 0 and amount_minor between -100000000 and 100000000),
  entry_type text not null check (entry_type in ('cash_top_up','delivery_commission')),
  idempotency_key uuid not null,
  order_id uuid references public.orders(id) on delete restrict,
  reason text not null check (char_length(reason) between 5 and 500),
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(driver_id,idempotency_key),
  check ((entry_type='cash_top_up' and amount_minor>0 and order_id is null) or
         (entry_type='delivery_commission' and amount_minor<0 and order_id is not null))
);
create unique index driver_wallet_one_commission_per_order on public.driver_wallet_ledger(order_id) where entry_type='delivery_commission';
create index driver_wallet_ledger_driver_created_idx on public.driver_wallet_ledger(driver_id,created_at desc);
alter table public.driver_wallet_ledger enable row level security;
create policy driver_wallet_ledger_select_self_or_admin on public.driver_wallet_ledger
  for select to authenticated using (driver_id=(select auth.uid()) or (select private.is_admin()));
revoke all on public.driver_wallet_ledger from public,anon,authenticated;
grant select on public.driver_wallet_ledger to authenticated;

create table public.cash_settlements (
  id bigint generated always as identity primary key,
  order_id uuid not null unique references public.orders(id) on delete restrict,
  driver_id uuid not null references public.driver_profiles(user_id) on delete restrict,
  idempotency_key uuid not null unique,
  purchase_amount_minor bigint not null check (purchase_amount_minor between 0 and 100000000),
  delivery_fee_minor bigint not null check (delivery_fee_minor between 0 and 100000000),
  commission_rate_basis_points integer not null check (commission_rate_basis_points between 0 and 5000),
  commission_amount_minor bigint not null check (commission_amount_minor between 0 and 100000000),
  driver_earning_minor bigint not null check (driver_earning_minor between 0 and 100000000),
  cash_collected_minor bigint not null check (cash_collected_minor between 0 and 200000000),
  settled_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (cash_collected_minor=purchase_amount_minor+delivery_fee_minor),
  check (driver_earning_minor=delivery_fee_minor-commission_amount_minor)
);
create index cash_settlements_driver_created_idx on public.cash_settlements(driver_id,created_at desc);
alter table public.cash_settlements enable row level security;
create policy cash_settlements_admin_select on public.cash_settlements
  for select to authenticated using ((select private.is_admin()));
revoke all on public.cash_settlements from public,anon,authenticated;
grant select on public.cash_settlements to authenticated;

create function private.set_commission_rate(p_rate_basis_points integer,p_reason text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_before integer; v_version integer;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_rate_basis_points is null or p_rate_basis_points not between 0 and 5000 then raise exception 'Commission must be between 0 and 5000 basis points'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 5 and 500 then raise exception 'A reason is required'; end if;
  select rate_basis_points,version into v_before,v_version from public.commission_policies where id=1 for update;
  if not found then v_version:=0; end if;
  v_version:=v_version+1;
  insert into public.commission_policies(id,rate_basis_points,version,updated_by,updated_at)
    values(1,p_rate_basis_points,v_version,v_actor,now())
    on conflict(id) do update set rate_basis_points=excluded.rate_basis_points,version=excluded.version,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,reason,before_data,after_data)
    values(v_actor,'set_commission_rate','commission_policy','1',trim(p_reason),
      case when v_before is null then '{}'::jsonb else jsonb_build_object('rate_basis_points',v_before,'version',v_version-1) end,
      jsonb_build_object('rate_basis_points',p_rate_basis_points,'version',v_version));
  return v_version;
end;
$$;

create function private.top_up_driver_wallet(p_driver_id uuid,p_amount_minor bigint,p_reason text,p_idempotency_key uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_amount_minor is null or p_amount_minor not between 1 and 100000000 then raise exception 'Invalid cash top-up amount'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 5 and 500 then raise exception 'A reason is required'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key is required'; end if;
  perform 1 from public.driver_profiles where user_id=p_driver_id and review_status='approved' for update;
  if not found then raise exception 'Approved driver not found'; end if;
  insert into public.driver_wallet_ledger(driver_id,amount_minor,entry_type,idempotency_key,reason,actor_id)
    values(p_driver_id,p_amount_minor,'cash_top_up',p_idempotency_key,trim(p_reason),auth.uid());
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,reason,after_data)
    values(auth.uid(),'top_up_driver_wallet','driver_wallet',p_driver_id::text,trim(p_reason),jsonb_build_object('amount_minor',p_amount_minor,'idempotency_key',p_idempotency_key));
  return (select coalesce(sum(amount_minor),0) from public.driver_wallet_ledger where driver_id=p_driver_id);
end;
$$;

create function private.settle_cash_order(p_order_id uuid,p_idempotency_key uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_order public.orders%rowtype; v_balance bigint; v_commission bigint;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key is required'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status<>'delivered' or v_order.purchase_amount_minor is null or v_order.driver_id is null then raise exception 'Only a delivered order with recorded purchase cost can be settled'; end if;
  if v_order.commission_rate_basis_points is null then raise exception 'Commission policy was not snapshotted for this order'; end if;
  if exists(select 1 from public.cash_settlements where order_id=p_order_id) then raise exception 'Order has already been settled'; end if;
  perform 1 from public.driver_profiles where user_id=v_order.driver_id for update;
  if not found then raise exception 'Driver wallet not found'; end if;
  select coalesce(sum(amount_minor),0) into v_balance from public.driver_wallet_ledger where driver_id=v_order.driver_id;
  v_commission:=floor(v_order.delivery_fee_minor*v_order.commission_rate_basis_points/10000.0+0.5)::bigint;
  if v_balance<v_commission then raise exception 'Driver wallet balance is insufficient for this commission'; end if;
  insert into public.cash_settlements(order_id,driver_id,idempotency_key,purchase_amount_minor,delivery_fee_minor,
      commission_rate_basis_points,commission_amount_minor,driver_earning_minor,cash_collected_minor,settled_by)
    values(p_order_id,v_order.driver_id,p_idempotency_key,v_order.purchase_amount_minor,v_order.delivery_fee_minor,
      v_order.commission_rate_basis_points,v_commission,v_order.delivery_fee_minor-v_commission,
      v_order.purchase_amount_minor+v_order.delivery_fee_minor,v_actor);
  if v_commission>0 then
    insert into public.driver_wallet_ledger(driver_id,amount_minor,entry_type,idempotency_key,order_id,reason,actor_id)
      values(v_order.driver_id,-v_commission,'delivery_commission',p_order_id,p_order_id,
        'عمولة توصيل الطلب '||left(p_order_id::text,8),v_actor);
  end if;
  update public.orders set status='settled' where id=p_order_id;
  insert into public.order_events(order_id,actor_id,event_type,details)
    values(p_order_id,v_actor,'cash_settled',jsonb_build_object('purchase_amount_minor',v_order.purchase_amount_minor,
      'delivery_fee_minor',v_order.delivery_fee_minor,'commission_minor',v_commission,
      'driver_earning_minor',v_order.delivery_fee_minor-v_commission));
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,reason,before_data,after_data)
    values(v_actor,'settle_cash_order','order',p_order_id::text,'تسوية نقدية بعد التحقق من استلام المبلغ من السائق',
      jsonb_build_object('status','delivered'),jsonb_build_object('status','settled','cash_collected_minor',v_order.purchase_amount_minor+v_order.delivery_fee_minor,
      'commission_minor',v_commission,'idempotency_key',p_idempotency_key));
  return v_balance-v_commission;
end;
$$;

create or replace function private.dispatch_order(p_order_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_count integer; v_rate integer; v_version integer;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  select rate_basis_points,version into v_rate,v_version from public.commission_policies where id=1;
  if not found then raise exception 'Set the commission policy before dispatching orders'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status not in ('requested','searching') or v_order.driver_id is not null then raise exception 'Order is not ready for dispatch'; end if;
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

create or replace function private.accept_order_offer(p_offer_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_driver_id uuid:=auth.uid(); v_offer public.order_offers%rowtype; v_order public.orders%rowtype; v_balance bigint; v_due bigint;
begin
  if v_driver_id is null then raise exception 'Authentication required'; end if;
  perform 1 from public.driver_profiles dp join public.user_roles ur on ur.user_id=dp.user_id
    where dp.user_id=v_driver_id and ur.role='driver' and dp.review_status='approved' and dp.is_online for update of dp;
  if not found then raise exception 'Approved online driver access required'; end if;
  select * into v_offer from public.order_offers where id=p_offer_id and driver_id=v_driver_id and status='pending' and expires_at>now() for update;
  if not found then raise exception 'Offer expired or unavailable'; end if;
  select * into v_order from public.orders where id=v_offer.order_id for update;
  if not found or v_order.status<>'searching' or v_order.driver_id is not null then raise exception 'Another driver already accepted this order'; end if;
  v_due:=floor(v_order.delivery_fee_minor*v_order.commission_rate_basis_points/10000.0+0.5)::bigint;
  select coalesce(sum(amount_minor),0) into v_balance from public.driver_wallet_ledger where driver_id=v_driver_id;
  if v_balance<v_due then raise exception 'Wallet balance is too low for this order'; end if;
  update public.orders set status='accepted',driver_id=v_driver_id where id=v_order.id;
  update public.order_offers set status='accepted',responded_at=now() where id=v_offer.id;
  update public.order_offers set status='revoked',responded_at=now() where order_id=v_order.id and id<>v_offer.id and status='pending';
  insert into public.order_events(order_id,actor_id,event_type) values(v_order.id,v_driver_id,'driver_accepted');
  return v_order.id;
end;
$$;

revoke all on function private.set_commission_rate(integer,text) from public,anon;
revoke all on function private.top_up_driver_wallet(uuid,bigint,text,uuid) from public,anon;
revoke all on function private.settle_cash_order(uuid,uuid) from public,anon;
revoke all on function private.dispatch_order(uuid) from public,anon;
revoke all on function private.accept_order_offer(uuid) from public,anon;
grant execute on function private.set_commission_rate(integer,text) to authenticated;
grant execute on function private.top_up_driver_wallet(uuid,bigint,text,uuid) to authenticated;
grant execute on function private.settle_cash_order(uuid,uuid) to authenticated;
grant execute on function private.dispatch_order(uuid) to authenticated;
grant execute on function private.accept_order_offer(uuid) to authenticated;

create function public.set_commission_rate(p_rate_basis_points integer,p_reason text)
returns integer language sql security invoker set search_path = '' as $$ select private.set_commission_rate($1,$2); $$;
create function public.top_up_driver_wallet(p_driver_id uuid,p_amount_minor bigint,p_reason text,p_idempotency_key uuid)
returns bigint language sql security invoker set search_path = '' as $$ select private.top_up_driver_wallet($1,$2,$3,$4); $$;
create function public.settle_cash_order(p_order_id uuid,p_idempotency_key uuid)
returns bigint language sql security invoker set search_path = '' as $$ select private.settle_cash_order($1,$2); $$;
revoke all on function public.set_commission_rate(integer,text) from public,anon;
revoke all on function public.top_up_driver_wallet(uuid,bigint,text,uuid) from public,anon;
revoke all on function public.settle_cash_order(uuid,uuid) from public,anon;
grant execute on function public.set_commission_rate(integer,text) to authenticated;
grant execute on function public.top_up_driver_wallet(uuid,bigint,text,uuid) to authenticated;
grant execute on function public.settle_cash_order(uuid,uuid) to authenticated;
