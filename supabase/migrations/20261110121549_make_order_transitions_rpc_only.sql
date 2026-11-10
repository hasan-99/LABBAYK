-- State transitions and immutable commission snapshots are written only by trusted RPCs.
revoke update on public.orders from authenticated;
