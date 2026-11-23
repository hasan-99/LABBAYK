alter table public.notifications drop constraint notifications_check;

alter table public.notifications
  add constraint notifications_source_or_announcement_check
  check (
    ((source_event_id is null) <> (source_offer_id is null))
    or (
      source_event_id is null
      and source_offer_id is null
      and order_id is null
      and event_type = 'app_announcement'
    )
  );
