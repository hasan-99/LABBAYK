create index if not exists admin_audit_log_actor_idx on public.admin_audit_log(actor_id) where actor_id is not null;
create index if not exists global_delivery_pricing_updated_by_idx on public.global_delivery_pricing(updated_by) where updated_by is not null;
create index if not exists order_events_actor_idx on public.order_events(actor_id) where actor_id is not null;
