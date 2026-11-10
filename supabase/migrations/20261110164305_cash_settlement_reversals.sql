alter table public.cash_settlements
  drop constraint cash_settlements_order_id_key;

create table public.cash_settlement_reversals (
  id bigint generated always as identity primary key,
  settlement_id bigint not null unique references public.cash_settlements(id) on delete restrict,
  idempotency_key uuid not null unique,
  reason text not null check (char_length(reason) between 5 and 500),
  reversed_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table public.cash_settlement_reversals enable row level security;
create policy cash_settlement_reversals_admin_select on public.cash_settlement_reversals
  for select to authenticated using ((select private.is_admin()));
revoke all on public.cash_settlement_reversals from public, anon, authenticated;
grant select on public.cash_settlement_reversals to authenticated;

alter table public.driver_wallet_ledger
  add column settlement_id bigint references public.cash_settlements(id) on delete restrict;
update public.driver_wallet_ledger l
set settlement_id=s.id
from public.cash_settlements s
where l.entry_type='delivery_commission' and l.order_id=s.order_id;
drop index if exists public.driver_wallet_one_commission_per_order;
create unique index driver_wallet_one_commission_per_settlement
  on public.driver_wallet_ledger(settlement_id) where entry_type='delivery_commission';

alter table public.driver_wallet_ledger
  drop constraint driver_wallet_ledger_entry_shape_check,
  add constraint driver_wallet_ledger_entry_shape_check check (
    (entry_type='cash_top_up' and amount_minor>0 and order_id is null and reversal_of_entry_id is null and settlement_id is null)
    or (entry_type='delivery_commission' and amount_minor<0 and order_id is not null and reversal_of_entry_id is null and settlement_id is not null)
    or (entry_type='wallet_reversal' and reversal_of_entry_id is not null and settlement_id is null)
    or (entry_type='manual_adjustment' and order_id is null and reversal_of_entry_id is null and settlement_id is null)
  );

create or replace function private.reverse_driver_wallet_entry(
  p_entry_id bigint,
  p_reason text,
  p_idempotency_key uuid
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_driver_id uuid;
  v_original public.driver_wallet_ledger%rowtype;
  v_existing public.driver_wallet_ledger%rowtype;
  v_balance bigint;
  v_reversal_id bigint;
begin
  if not private.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  if p_entry_id is null then raise exception 'Wallet entry is required'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 5 and 500 then raise exception 'A reason is required'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key is required'; end if;

  select driver_id into v_driver_id from public.driver_wallet_ledger where id=p_entry_id;
  if not found then raise exception 'Wallet entry not found'; end if;
  perform 1 from public.driver_profiles where user_id=v_driver_id for update;
  if not found then raise exception 'Driver wallet not found'; end if;
  select * into v_original from public.driver_wallet_ledger where id=p_entry_id for update;
  if not found or v_original.driver_id<>v_driver_id then raise exception 'Wallet entry changed'; end if;
  if v_original.entry_type='wallet_reversal' then raise exception 'A reversal cannot itself be reversed'; end if;
  if v_original.entry_type='delivery_commission' and not exists (
    select 1 from public.cash_settlement_reversals r where r.settlement_id=v_original.settlement_id
  ) then raise exception 'Reverse the cash settlement to return its commission'; end if;

  select * into v_existing from public.driver_wallet_ledger
    where driver_id=v_driver_id and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.entry_type<>'wallet_reversal' or v_existing.reversal_of_entry_id<>p_entry_id
      or v_existing.amount_minor<>-v_original.amount_minor or v_existing.reason<>trim(p_reason)
    then raise exception 'Idempotency key was already used for different wallet details'; end if;
    return (select coalesce(sum(amount_minor),0) from public.driver_wallet_ledger where driver_id=v_driver_id);
  end if;
  if exists (select 1 from public.driver_wallet_ledger where reversal_of_entry_id=p_entry_id) then
    raise exception 'Wallet entry has already been reversed';
  end if;
  select coalesce(sum(amount_minor),0) into v_balance from public.driver_wallet_ledger where driver_id=v_driver_id;
  if v_balance-v_original.amount_minor<0 then raise exception 'Reversal would make the driver wallet negative'; end if;

  insert into public.driver_wallet_ledger(
    driver_id,amount_minor,entry_type,idempotency_key,order_id,reversal_of_entry_id,reason,actor_id
  ) values (
    v_driver_id,-v_original.amount_minor,'wallet_reversal',p_idempotency_key,v_original.order_id,p_entry_id,trim(p_reason),v_actor
  ) returning id into v_reversal_id;
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,reason,before_data,after_data)
  values(v_actor,'reverse_driver_wallet_entry','driver_wallet',v_driver_id::text,trim(p_reason),
    jsonb_build_object('entry_id',p_entry_id,'amount_minor',v_original.amount_minor,'entry_type',v_original.entry_type),
    jsonb_build_object('reversal_entry_id',v_reversal_id,'reversal_of_entry_id',p_entry_id,
      'amount_minor',-v_original.amount_minor,'order_id',v_original.order_id,'settlement_id',v_original.settlement_id));
  return v_balance-v_original.amount_minor;
end;
$$;

create or replace function private.settle_cash_order(p_order_id uuid,p_idempotency_key uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid:=auth.uid();
  v_order public.orders%rowtype;
  v_balance bigint;
  v_commission bigint;
  v_settlement_id bigint;
  v_existing public.cash_settlements%rowtype;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key is required'; end if;
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
  if v_balance<v_commission then raise exception 'Driver wallet balance is insufficient for this commission'; end if;
  insert into public.cash_settlements(order_id,driver_id,idempotency_key,purchase_amount_minor,delivery_fee_minor,
      commission_rate_basis_points,commission_amount_minor,driver_earning_minor,cash_collected_minor,settled_by)
    values(p_order_id,v_order.driver_id,p_idempotency_key,v_order.purchase_amount_minor,v_order.delivery_fee_minor,
      v_order.commission_rate_basis_points,v_commission,v_order.delivery_fee_minor-v_commission,
      v_order.purchase_amount_minor+v_order.delivery_fee_minor,v_actor)
    returning id into v_settlement_id;
  if v_commission>0 then
    insert into public.driver_wallet_ledger(driver_id,amount_minor,entry_type,idempotency_key,order_id,settlement_id,reason,actor_id)
      values(v_order.driver_id,-v_commission,'delivery_commission',p_idempotency_key,p_order_id,v_settlement_id,
        'عمولة توصيل الطلب '||left(p_order_id::text,8),v_actor);
  end if;
  update public.orders set status='settled' where id=p_order_id;
  insert into public.order_events(order_id,actor_id,event_type,details)
    values(p_order_id,v_actor,'cash_settled',jsonb_build_object('settlement_id',v_settlement_id,
      'purchase_amount_minor',v_order.purchase_amount_minor,'delivery_fee_minor',v_order.delivery_fee_minor,
      'commission_minor',v_commission,'driver_earning_minor',v_order.delivery_fee_minor-v_commission));
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,reason,before_data,after_data)
    values(v_actor,'settle_cash_order','order',p_order_id::text,'تسوية نقدية بعد التحقق من استلام المبلغ من السائق',
      jsonb_build_object('status','delivered'),jsonb_build_object('status','settled','settlement_id',v_settlement_id,
        'cash_collected_minor',v_order.purchase_amount_minor+v_order.delivery_fee_minor,
        'commission_minor',v_commission,'idempotency_key',p_idempotency_key));
  return v_balance-v_commission;
end;
$$;

create function private.reverse_cash_settlement(p_settlement_id bigint,p_reason text,p_idempotency_key uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid:=auth.uid();
  v_settlement public.cash_settlements%rowtype;
  v_order public.orders%rowtype;
  v_existing public.cash_settlement_reversals%rowtype;
  v_commission_entry_id bigint;
  v_balance bigint;
begin
  if not private.is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
  if p_settlement_id is null then raise exception 'Cash settlement is required'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 5 and 500 then raise exception 'A reason is required'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key is required'; end if;
  select * into v_settlement from public.cash_settlements where id=p_settlement_id;
  if not found then raise exception 'Cash settlement not found'; end if;
  select * into v_order from public.orders where id=v_settlement.order_id for update;
  if not found then raise exception 'Settlement order not found'; end if;
  select * into v_settlement from public.cash_settlements where id=p_settlement_id for update;
  select * into v_existing from public.cash_settlement_reversals where settlement_id=p_settlement_id;
  if found then
    if v_existing.idempotency_key<>p_idempotency_key or v_existing.reason<>trim(p_reason) then
      raise exception 'Cash settlement has already been reversed';
    end if;
    return (select coalesce(sum(amount_minor),0) from public.driver_wallet_ledger where driver_id=v_settlement.driver_id);
  end if;
  if v_order.status<>'settled' then raise exception 'Only the active settlement of a settled order can be reversed'; end if;
  if exists(select 1 from public.cash_settlements newer where newer.order_id=v_settlement.order_id
    and newer.id>v_settlement.id and not exists(
      select 1 from public.cash_settlement_reversals r where r.settlement_id=newer.id))
  then raise exception 'Only the latest active settlement can be reversed'; end if;
  perform 1 from public.driver_profiles where user_id=v_settlement.driver_id for update;
  if not found then raise exception 'Driver wallet not found'; end if;
  insert into public.cash_settlement_reversals(settlement_id,idempotency_key,reason,reversed_by)
    values(p_settlement_id,p_idempotency_key,trim(p_reason),v_actor);
  if v_settlement.commission_amount_minor>0 then
    select id into v_commission_entry_id from public.driver_wallet_ledger
      where settlement_id=p_settlement_id and entry_type='delivery_commission' for update;
    if not found then raise exception 'Settlement commission ledger entry is missing'; end if;
    v_balance:=private.reverse_driver_wallet_entry(v_commission_entry_id,trim(p_reason),p_idempotency_key);
  else
    select coalesce(sum(amount_minor),0) into v_balance from public.driver_wallet_ledger where driver_id=v_settlement.driver_id;
  end if;
  update public.orders set status='delivered' where id=v_settlement.order_id;
  insert into public.order_events(order_id,actor_id,event_type,details)
    values(v_settlement.order_id,v_actor,'cash_settlement_reversed',jsonb_build_object('settlement_id',p_settlement_id,
      'commission_returned_minor',v_settlement.commission_amount_minor));
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,reason,before_data,after_data)
    values(v_actor,'reverse_cash_settlement','cash_settlement',p_settlement_id::text,trim(p_reason),
      jsonb_build_object('order_status','settled','commission_minor',v_settlement.commission_amount_minor,
        'cash_collected_minor',v_settlement.cash_collected_minor),
      jsonb_build_object('order_status','delivered','commission_returned_minor',v_settlement.commission_amount_minor,
        'wallet_reversal_entry_id',v_commission_entry_id));
  return v_balance;
end;
$$;
revoke all on function private.reverse_cash_settlement(bigint,text,uuid) from public,anon;
grant execute on function private.reverse_cash_settlement(bigint,text,uuid) to authenticated;
create function public.reverse_cash_settlement(p_settlement_id bigint,p_reason text,p_idempotency_key uuid)
returns bigint language sql security invoker set search_path = '' as $$
  select private.reverse_cash_settlement($1,$2,$3);
$$;
revoke all on function public.reverse_cash_settlement(bigint,text,uuid) from public,anon,authenticated;
grant execute on function public.reverse_cash_settlement(bigint,text,uuid) to authenticated;

create or replace function private.get_cash_reconciliation(p_from timestamptz,p_to timestamptz)
returns table(settlement_count bigint,purchase_total_minor bigint,delivery_fee_total_minor bigint,
  commission_total_minor bigint,driver_earning_total_minor bigint,cash_collected_total_minor bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_from is null or p_to is null or p_to<=p_from or p_to-p_from>interval '366 days' then
    raise exception 'A valid date range up to 366 days is required';
  end if;
  return query select count(*)::bigint,coalesce(sum(s.purchase_amount_minor),0)::bigint,
    coalesce(sum(s.delivery_fee_minor),0)::bigint,coalesce(sum(s.commission_amount_minor),0)::bigint,
    coalesce(sum(s.driver_earning_minor),0)::bigint,coalesce(sum(s.cash_collected_minor),0)::bigint
  from public.cash_settlements s
  where s.created_at>=p_from and s.created_at<p_to
    and not exists(select 1 from public.cash_settlement_reversals r where r.settlement_id=s.id);
end;
$$;
create or replace function public.get_cash_reconciliation(p_from timestamptz,p_to timestamptz)
returns table(settlement_count bigint,purchase_total_minor bigint,delivery_fee_total_minor bigint,
  commission_total_minor bigint,driver_earning_total_minor bigint,cash_collected_total_minor bigint)
language sql stable security invoker set search_path = '' as $$
  select * from private.get_cash_reconciliation($1,$2);
$$;
