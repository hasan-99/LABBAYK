alter table public.orders alter column customer_id drop not null;
alter table public.orders alter column address_id drop not null;
alter table public.orders drop constraint orders_customer_id_fkey;
alter table public.orders add constraint orders_customer_id_fkey
  foreign key (customer_id) references auth.users(id) on delete set null;
alter table public.orders drop constraint orders_address_id_fkey;
alter table public.orders add constraint orders_address_id_fkey
  foreign key (address_id) references public.addresses(id) on delete set null;

create or replace function private.account_deletion_assets()
returns table(profile_avatar_path text, order_ids uuid[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.user_roles
    where user_id = v_user_id and role in ('driver_pending', 'driver', 'super_admin')
  ) then
    raise exception 'Driver or administrator accounts must contact support for deletion' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.user_roles where user_id = v_user_id and role = 'customer'
  ) then
    raise exception 'Customer account not found' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.orders
    where customer_id = v_user_id and status not in ('settled', 'cancelled')
  ) then
    raise exception 'Resolve active orders before deleting this account' using errcode = '55000';
  end if;
  if exists (
    select 1
    from public.order_disputes d
    join public.orders o on o.id = d.order_id
    where o.customer_id = v_user_id and d.resolved_at is null
  ) then
    raise exception 'Resolve open support disputes before deleting this account' using errcode = '55000';
  end if;

  return query
  select
    (select p.avatar_path from public.profiles p where p.id = v_user_id),
    coalesce((select array_agg(o.id) from public.orders o where o.customer_id = v_user_id), array[]::uuid[]);
end;
$$;

revoke all on function private.account_deletion_assets() from public, anon, authenticated;
grant execute on function private.account_deletion_assets() to authenticated;

create or replace function public.account_deletion_assets()
returns table(profile_avatar_path text, order_ids uuid[])
language sql
security invoker
set search_path = ''
as $$
  select * from private.account_deletion_assets();
$$;
revoke all on function public.account_deletion_assets() from public, anon;
grant execute on function public.account_deletion_assets() to authenticated;

create or replace function private.complete_account_deletion(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := p_user_id;
  v_order_ids uuid[];
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' or v_user_id is null then
    raise exception 'Service authorization required' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.user_roles
    where user_id = v_user_id and role in ('driver_pending', 'driver', 'super_admin')
  ) then
    raise exception 'Driver or administrator accounts must contact support for deletion' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.user_roles where user_id = v_user_id and role = 'customer'
  ) then
    raise exception 'Customer account not found' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.orders
    where customer_id = v_user_id and status not in ('settled', 'cancelled')
  ) then
    raise exception 'Resolve active orders before deleting this account' using errcode = '55000';
  end if;
  if exists (
    select 1
    from public.order_disputes d
    join public.orders o on o.id = d.order_id
    where o.customer_id = v_user_id and d.resolved_at is null
  ) then
    raise exception 'Resolve open support disputes before deleting this account' using errcode = '55000';
  end if;

  select coalesce(array_agg(id), array[]::uuid[]) into v_order_ids
  from public.orders where customer_id = v_user_id;

  update public.orders
  set customer_id = null,
      address_id = null,
      request_text = '[Removed at account deletion]',
      delivery_code_hash = null,
      delivery_code_expires_at = null,
      delivery_code_attempts = 0
  where customer_id = v_user_id;

  delete from public.order_disputes where order_id = any(v_order_ids);
  update public.order_events set details = '{}'::jsonb where order_id = any(v_order_ids);

  update public.admin_audit_log
  set actor_id = case when actor_id = v_user_id then null else actor_id end,
      entity_id = case when entity_id = v_user_id::text then '[deleted account]' else entity_id end,
      reason = 'Account identifiers removed at user request',
      before_data = '{}'::jsonb,
      after_data = '{}'::jsonb
  where actor_id = v_user_id
     or entity_id = v_user_id::text
     or entity_id = any(select id::text from public.orders where id = any(v_order_ids));

end;
$$;

revoke all on function private.complete_account_deletion(uuid) from public, anon, authenticated;
grant execute on function private.complete_account_deletion(uuid) to service_role;

create or replace function public.complete_account_deletion(p_user_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.complete_account_deletion($1);
$$;
revoke all on function public.complete_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.complete_account_deletion(uuid) to service_role;
