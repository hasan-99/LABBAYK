alter table public.driver_wallet_ledger
  add column reversal_of_entry_id bigint references public.driver_wallet_ledger(id) on delete restrict;

drop index if exists public.driver_wallet_one_commission_per_order;
create unique index driver_wallet_one_commission_per_order
  on public.driver_wallet_ledger(order_id)
  where entry_type = 'delivery_commission';
create unique index driver_wallet_one_reversal_per_entry
  on public.driver_wallet_ledger(reversal_of_entry_id)
  where reversal_of_entry_id is not null;

alter table public.driver_wallet_ledger
  drop constraint driver_wallet_ledger_check,
  drop constraint driver_wallet_ledger_entry_type_check,
  add constraint driver_wallet_ledger_entry_type_check
    check (entry_type in ('cash_top_up', 'delivery_commission', 'wallet_reversal')),
  add constraint driver_wallet_ledger_entry_shape_check
    check (
      (entry_type = 'cash_top_up' and amount_minor > 0 and order_id is null and reversal_of_entry_id is null)
      or (entry_type = 'delivery_commission' and amount_minor < 0 and order_id is not null and reversal_of_entry_id is null)
      or (entry_type = 'wallet_reversal' and reversal_of_entry_id is not null)
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
  if p_entry_id is null then raise exception 'Ledger entry is required'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 5 and 500 then raise exception 'A reason is required'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key is required'; end if;

  select driver_id into v_driver_id
    from public.driver_wallet_ledger where id = p_entry_id;
  if not found then raise exception 'Wallet entry not found'; end if;
  perform 1 from public.driver_profiles where user_id = v_driver_id for update;
  if not found then raise exception 'Driver wallet not found'; end if;

  select * into v_original from public.driver_wallet_ledger where id = p_entry_id for update;
  if not found or v_original.driver_id <> v_driver_id then raise exception 'Wallet entry changed'; end if;
  if v_original.entry_type = 'wallet_reversal' then raise exception 'A reversal cannot itself be reversed'; end if;

  select * into v_existing from public.driver_wallet_ledger
    where driver_id = v_driver_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.entry_type <> 'wallet_reversal'
      or v_existing.reversal_of_entry_id <> p_entry_id
      or v_existing.amount_minor <> -v_original.amount_minor
      or v_existing.reason <> trim(p_reason)
    then raise exception 'Idempotency key was already used for different wallet details'; end if;
    return (select coalesce(sum(amount_minor), 0) from public.driver_wallet_ledger where driver_id = v_driver_id);
  end if;

  if exists (select 1 from public.driver_wallet_ledger where reversal_of_entry_id = p_entry_id) then
    raise exception 'Wallet entry has already been reversed';
  end if;
  select coalesce(sum(amount_minor), 0) into v_balance
    from public.driver_wallet_ledger where driver_id = v_driver_id;
  if v_balance - v_original.amount_minor < 0 then
    raise exception 'Reversal would make the driver wallet negative';
  end if;

  insert into public.driver_wallet_ledger(
    driver_id, amount_minor, entry_type, idempotency_key, order_id,
    reversal_of_entry_id, reason, actor_id
  ) values (
    v_driver_id, -v_original.amount_minor, 'wallet_reversal', p_idempotency_key,
    v_original.order_id, p_entry_id, trim(p_reason), v_actor
  ) returning id into v_reversal_id;

  insert into public.admin_audit_log(actor_id, action, entity_type, entity_id, reason, before_data, after_data)
  values (
    v_actor, 'reverse_driver_wallet_entry', 'driver_wallet', v_driver_id::text, trim(p_reason),
    jsonb_build_object('entry_id', p_entry_id, 'amount_minor', v_original.amount_minor, 'entry_type', v_original.entry_type),
    jsonb_build_object('reversal_entry_id', v_reversal_id, 'reversal_of_entry_id', p_entry_id,
      'amount_minor', -v_original.amount_minor, 'order_id', v_original.order_id)
  );

  return v_balance - v_original.amount_minor;
end;
$$;
revoke all on function private.reverse_driver_wallet_entry(bigint, text, uuid) from public, anon;
grant execute on function private.reverse_driver_wallet_entry(bigint, text, uuid) to authenticated;

create or replace function public.reverse_driver_wallet_entry(
  p_entry_id bigint,
  p_reason text,
  p_idempotency_key uuid
)
returns bigint
language sql
security invoker
set search_path = ''
as $$ select private.reverse_driver_wallet_entry($1, $2, $3); $$;
revoke all on function public.reverse_driver_wallet_entry(bigint, text, uuid) from public, anon;
grant execute on function public.reverse_driver_wallet_entry(bigint, text, uuid) to authenticated;
