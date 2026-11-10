alter table public.driver_wallet_ledger
  drop constraint driver_wallet_ledger_entry_type_check,
  drop constraint driver_wallet_ledger_entry_shape_check,
  add constraint driver_wallet_ledger_entry_type_check
    check (entry_type in ('cash_top_up', 'delivery_commission', 'wallet_reversal', 'manual_adjustment')),
  add constraint driver_wallet_ledger_entry_shape_check
    check (
      (entry_type = 'cash_top_up' and amount_minor > 0 and order_id is null and reversal_of_entry_id is null)
      or (entry_type = 'delivery_commission' and amount_minor < 0 and order_id is not null and reversal_of_entry_id is null)
      or (entry_type = 'wallet_reversal' and reversal_of_entry_id is not null)
      or (entry_type = 'manual_adjustment' and order_id is null and reversal_of_entry_id is null)
    );

create or replace function private.adjust_driver_wallet(
  p_driver_id uuid,
  p_amount_minor bigint,
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
  v_existing public.driver_wallet_ledger%rowtype;
  v_balance bigint;
  v_new_balance bigint;
begin
  if not private.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  if p_driver_id is null then raise exception 'Driver is required'; end if;
  if p_amount_minor is null or p_amount_minor = 0 or p_amount_minor not between -100000000 and 100000000 then
    raise exception 'Adjustment must be a nonzero amount within the allowed limit';
  end if;
  if p_reason is null or char_length(trim(p_reason)) not between 5 and 500 then raise exception 'A reason is required'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key is required'; end if;

  perform 1 from public.driver_profiles where user_id = p_driver_id for update;
  if not found then raise exception 'Driver wallet not found'; end if;

  select * into v_existing from public.driver_wallet_ledger
    where driver_id = p_driver_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.entry_type <> 'manual_adjustment'
      or v_existing.amount_minor <> p_amount_minor
      or v_existing.reason <> trim(p_reason)
    then raise exception 'Idempotency key was already used for different wallet details'; end if;
    return (select coalesce(sum(amount_minor), 0) from public.driver_wallet_ledger where driver_id = p_driver_id);
  end if;

  select coalesce(sum(amount_minor), 0) into v_balance
    from public.driver_wallet_ledger where driver_id = p_driver_id;
  v_new_balance := v_balance + p_amount_minor;
  if v_new_balance < 0 then raise exception 'Adjustment would make the driver wallet negative'; end if;

  insert into public.driver_wallet_ledger(
    driver_id, amount_minor, entry_type, idempotency_key, order_id, reversal_of_entry_id, reason, actor_id
  ) values (
    p_driver_id, p_amount_minor, 'manual_adjustment', p_idempotency_key, null, null, trim(p_reason), v_actor
  );

  insert into public.admin_audit_log(actor_id, action, entity_type, entity_id, reason, before_data, after_data)
  values (
    v_actor, 'adjust_driver_wallet', 'driver_wallet', p_driver_id::text, trim(p_reason),
    jsonb_build_object('balance_minor', v_balance),
    jsonb_build_object('balance_minor', v_new_balance, 'amount_minor', p_amount_minor, 'idempotency_key', p_idempotency_key)
  );

  return v_new_balance;
end;
$$;

revoke all on function private.adjust_driver_wallet(uuid, bigint, text, uuid) from public, anon;
grant execute on function private.adjust_driver_wallet(uuid, bigint, text, uuid) to authenticated;

create or replace function public.adjust_driver_wallet(
  p_driver_id uuid,
  p_amount_minor bigint,
  p_reason text,
  p_idempotency_key uuid
)
returns bigint
language sql
security invoker
set search_path = ''
as $$
  select private.adjust_driver_wallet($1, $2, $3, $4);
$$;

revoke all on function public.adjust_driver_wallet(uuid, bigint, text, uuid) from public, anon, authenticated;
grant execute on function public.adjust_driver_wallet(uuid, bigint, text, uuid) to authenticated;
