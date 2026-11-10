create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete restrict,
  address_id uuid not null references public.addresses(id) on delete restrict,
  zone_id uuid not null references public.service_zones(id) on delete restrict,
  idempotency_key uuid not null,
  category text not null check (char_length(category) between 1 and 80),
  request_text text not null check (char_length(request_text) between 1 and 4000),
  status text not null default 'requested' check (status in ('requested','quoted','accepted','assigned','shopping','awaiting_approval','delivering','delivered','cancelled')),
  delivery_fee_minor bigint not null check (delivery_fee_minor >= 0),
  currency text not null default 'SYP' check (currency = 'SYP'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, idempotency_key)
);

create index orders_customer_created_idx on public.orders (customer_id, created_at desc);
create index orders_status_created_idx on public.orders (status, created_at desc);
create index orders_zone_idx on public.orders (zone_id, created_at desc);
create trigger orders_set_updated_at before update on public.orders
  for each row execute function private.set_updated_at();

alter table public.orders enable row level security;
create policy orders_customer_select on public.orders
  for select to authenticated using (customer_id = (select auth.uid()) or (select private.is_admin()));
create policy orders_admin_update on public.orders
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
grant select, update on public.orders to authenticated;

create or replace function public.create_customer_order(
  p_idempotency_key uuid,
  p_address_id uuid,
  p_category text,
  p_request_text text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid := auth.uid();
  v_address public.addresses%rowtype;
  v_zone public.service_zones%rowtype;
  v_order_id uuid;
begin
  if v_customer_id is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null then raise exception 'Request key is required'; end if;
  if p_category is null or char_length(trim(p_category)) not between 1 and 80 then raise exception 'Invalid category'; end if;
  if p_request_text is null or char_length(trim(p_request_text)) not between 1 and 4000 then raise exception 'Invalid request'; end if;

  select * into v_address from public.addresses where id = p_address_id and user_id = v_customer_id;
  if not found then raise exception 'Address not found'; end if;
  select * into v_zone from public.service_zones where id = v_address.zone_id and active;
  if not found then raise exception 'Delivery zone is inactive'; end if;

  insert into public.orders (customer_id, address_id, zone_id, idempotency_key, category, request_text, delivery_fee_minor)
  values (v_customer_id, v_address.id, v_zone.id, p_idempotency_key, trim(p_category), trim(p_request_text), v_zone.delivery_surcharge_minor)
  on conflict (customer_id, idempotency_key) do nothing
  returning id into v_order_id;

  if v_order_id is null then
    select id into v_order_id from public.orders where customer_id = v_customer_id and idempotency_key = p_idempotency_key;
  end if;
  return v_order_id;
end;
$$;
revoke all on function public.create_customer_order(uuid, uuid, text, text) from public, anon;
grant execute on function public.create_customer_order(uuid, uuid, text, text) to authenticated;
