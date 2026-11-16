create table public.web_push_subscriptions (
  endpoint text primary key check (endpoint ~ '^https://[^[:space:]]+$' and char_length(endpoint) <= 2048),
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null check (char_length(p256dh) between 40 and 200),
  auth text not null check (char_length(auth) between 20 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index web_push_subscriptions_user_idx on public.web_push_subscriptions(user_id);
alter table public.web_push_subscriptions enable row level security;
revoke all on public.web_push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.web_push_subscriptions to authenticated;

create policy web_push_subscriptions_select_own on public.web_push_subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy web_push_subscriptions_insert_own on public.web_push_subscriptions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy web_push_subscriptions_update_own on public.web_push_subscriptions
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy web_push_subscriptions_delete_own on public.web_push_subscriptions
  for delete to authenticated using ((select auth.uid()) = user_id);

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'labbayk_push_dispatch_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'labbayk_push_dispatch_secret',
      'Authenticates database initiated web push delivery requests.'
    );
  end if;
end;
$$;

create function public.get_push_delivery_config()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_config jsonb;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  select coalesce(jsonb_object_agg(name, decrypted_secret), '{}'::jsonb)
    into v_config
    from vault.decrypted_secrets
    where name in ('labbayk_push_dispatch_secret', 'labbayk_vapid_public_key', 'labbayk_vapid_private_key');
  return v_config;
end;
$$;
revoke all on function public.get_push_delivery_config() from public, anon, authenticated;
grant execute on function public.get_push_delivery_config() to service_role;

create function private.dispatch_web_push_for_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_dispatch_secret text;
begin
  select decrypted_secret into v_dispatch_secret
  from vault.decrypted_secrets
  where name = 'labbayk_push_dispatch_secret';
  if v_dispatch_secret is null then return new; end if;

  perform net.http_post(
    url := 'https://ikldhwnwhbotujfyfpzy.supabase.co/functions/v1/push-notification',
    body := jsonb_build_object('notification_id', new.id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-labbayk-push-secret', v_dispatch_secret
    ),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  raise warning 'Web push dispatch failed for notification %: %', new.id, sqlerrm;
  return new;
end;
$$;
revoke all on function private.dispatch_web_push_for_notification() from public, anon, authenticated;
create trigger notification_web_push_dispatch
  after insert on public.notifications
  for each row execute function private.dispatch_web_push_for_notification();
