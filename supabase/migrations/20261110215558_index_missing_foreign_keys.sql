create index if not exists cash_settlement_reversals_reversed_by_idx
  on public.cash_settlement_reversals (reversed_by);

create index if not exists cash_settlements_order_id_idx
  on public.cash_settlements (order_id);

create index if not exists driver_wallet_ledger_order_id_idx
  on public.driver_wallet_ledger (order_id);
