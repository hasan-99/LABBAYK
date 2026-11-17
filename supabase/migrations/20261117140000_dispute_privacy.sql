-- A support report is private: only the person who opened it and administrators can read it.
-- Previously the order's other participant (customer or driver) could read the reason and details too.
drop policy if exists order_disputes_select_participant_or_admin on public.order_disputes;
create policy order_disputes_select_opener_or_admin on public.order_disputes
  for select to authenticated using (
    opened_by = (select auth.uid()) or (select private.is_admin())
  );

-- The dispute events carry the reason, so hide them from the other participant as well.
drop policy if exists order_events_customer_driver_admin_select on public.order_events;
create policy order_events_participant_select on public.order_events
  for select to authenticated using (
    (select private.is_admin())
    or actor_id = (select auth.uid())
    or (
      event_type not in ('order_disputed', 'dispute_resolved')
      and exists (
        select 1 from public.orders o
        where o.id = order_id
          and (o.customer_id = (select auth.uid()) or o.driver_id = (select auth.uid()))
      )
    )
  );
