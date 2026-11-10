create index if not exists cash_settlements_settled_by_idx on public.cash_settlements(settled_by);
create index if not exists commission_policies_updated_by_idx on public.commission_policies(updated_by) where updated_by is not null;
create index if not exists driver_wallet_ledger_actor_idx on public.driver_wallet_ledger(actor_id) where actor_id is not null;
