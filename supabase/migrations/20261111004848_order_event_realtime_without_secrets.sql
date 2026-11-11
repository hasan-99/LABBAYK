-- Realtime publishes complete changed rows after checking row access. Orders
-- contain delivery-code hashes and internal audit fields, so notify clients
-- through the participant-scoped, append-only event table instead.
alter publication supabase_realtime drop table public.orders;
alter publication supabase_realtime add table public.order_events;
