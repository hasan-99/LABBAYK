create function private.get_cash_reconciliation(p_from timestamptz, p_to timestamptz)
returns table (
  settlement_count bigint,
  purchase_total_minor bigint,
  delivery_fee_total_minor bigint,
  commission_total_minor bigint,
  driver_earning_total_minor bigint,
  cash_collected_total_minor bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '366 days' then
    raise exception 'A valid date range up to 366 days is required';
  end if;

  return query
  select count(*)::bigint,
    coalesce(sum(s.purchase_amount_minor), 0)::bigint,
    coalesce(sum(s.delivery_fee_minor), 0)::bigint,
    coalesce(sum(s.commission_amount_minor), 0)::bigint,
    coalesce(sum(s.driver_earning_minor), 0)::bigint,
    coalesce(sum(s.cash_collected_minor), 0)::bigint
  from public.cash_settlements s
  where s.created_at >= p_from and s.created_at < p_to;
end;
$$;

revoke all on function private.get_cash_reconciliation(timestamptz,timestamptz) from public, anon;
grant execute on function private.get_cash_reconciliation(timestamptz,timestamptz) to authenticated;

create function public.get_cash_reconciliation(p_from timestamptz, p_to timestamptz)
returns table (
  settlement_count bigint,
  purchase_total_minor bigint,
  delivery_fee_total_minor bigint,
  commission_total_minor bigint,
  driver_earning_total_minor bigint,
  cash_collected_total_minor bigint
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.get_cash_reconciliation($1, $2);
$$;

revoke all on function public.get_cash_reconciliation(timestamptz,timestamptz) from public, anon;
grant execute on function public.get_cash_reconciliation(timestamptz,timestamptz) to authenticated;
