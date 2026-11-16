create extension if not exists pg_net with schema extensions;

create table public.push_tokens (
  expo_push_token text primary key
    check (
      expo_push_token ~ '^ExponentPushToken\[[^]]+\]$'
      or expo_push_token ~ '^ExpoPushToken\[[^]]+\]$'
    ),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_tokens_user_updated_idx
  on public.push_tokens (user_id, updated_at desc);

alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from public, anon, authenticated;
grant select, insert, update, delete on public.push_tokens to authenticated;

create policy push_tokens_select_own on public.push_tokens
  for select to authenticated using ((select auth.uid()) = user_id);
create policy push_tokens_insert_own on public.push_tokens
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy push_tokens_update_own on public.push_tokens
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy push_tokens_delete_own on public.push_tokens
  for delete to authenticated using ((select auth.uid()) = user_id);

create function private.dispatch_expo_push_for_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_messages jsonb;
begin
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'to', devices.expo_push_token,
      'title', new.title,
      'body', new.body,
      'sound', 'default',
      'priority', 'high',
      'channelId', 'order_updates',
      'data', jsonb_build_object(
        'notificationId', new.id::text,
        'orderId', new.order_id::text,
        'eventType', new.event_type
      )
    )),
    '[]'::jsonb
  )
  into v_messages
  from (
    select expo_push_token
    from public.push_tokens
    where user_id = new.recipient_id
    order by updated_at desc
    limit 20
  ) as devices;

  if jsonb_array_length(v_messages) = 0 then return new; end if;

  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    body := v_messages,
    headers := '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  raise warning 'Push dispatch failed for notification %: %', new.id, sqlerrm;
  return new;
end;
$$;

revoke all on function private.dispatch_expo_push_for_notification() from public, anon, authenticated;
create trigger notification_expo_push_dispatch
  after insert on public.notifications
  for each row execute function private.dispatch_expo_push_for_notification();
