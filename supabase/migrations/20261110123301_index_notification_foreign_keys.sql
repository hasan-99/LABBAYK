create index if not exists notifications_order_id_idx on public.notifications(order_id) where order_id is not null;
create index if not exists notifications_source_event_id_idx on public.notifications(source_event_id) where source_event_id is not null;
create index if not exists notifications_source_offer_id_idx on public.notifications(source_offer_id) where source_offer_id is not null;
