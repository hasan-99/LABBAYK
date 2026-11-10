alter table public.orders
  add column budget_ceiling_minor bigint not null default 0 check (budget_ceiling_minor between 0 and 100000000),
  add column purchase_amount_minor bigint check (purchase_amount_minor is null or purchase_amount_minor between 0 and 100000000),
  add column delivery_code_hash text,
  add column delivery_code_expires_at timestamptz,
  add column delivery_code_attempts smallint not null default 0 check (delivery_code_attempts between 0 and 5),
  add column purchased_at timestamptz,
  add column delivered_at timestamptz;

alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('requested','quoted','searching','accepted','assigned','shopping','awaiting_approval','purchased','delivering','delivered','cancelled'));
alter table public.orders add constraint orders_delivery_code_fields_check
  check ((delivery_code_hash is null) = (delivery_code_expires_at is null));
alter table public.orders add constraint orders_purchase_status_check
  check (status not in ('purchased','delivering','delivered') or purchase_amount_minor is not null);
revoke update on public.orders from authenticated;
create index orders_active_driver_idx on public.orders (driver_id, status, updated_at desc)
  where driver_id is not null and status not in ('delivered','cancelled');

create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null check (char_length(event_type) between 1 and 60),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);
create index order_events_order_created_idx on public.order_events (order_id, created_at, id);
alter table public.order_events enable row level security;
create policy order_events_customer_driver_admin_select on public.order_events
  for select to authenticated using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.customer_id = (select auth.uid()) or o.driver_id = (select auth.uid()) or (select private.is_admin()))
    )
  );
revoke all on public.order_events from public, anon, authenticated;
grant select on public.order_events to authenticated;

drop function public.create_customer_order(uuid, uuid, text, text);

create or replace function private.create_customer_order(
  p_idempotency_key uuid,
  p_address_id uuid,
  p_category text,
  p_request_text text,
  p_budget_ceiling_minor bigint
) returns uuid
language plpgsql security definer set search_path = ''
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
  if p_budget_ceiling_minor is null or p_budget_ceiling_minor not between 1 and 100000000 then raise exception 'A valid purchase budget is required'; end if;

  select * into v_address from public.addresses where id = p_address_id and user_id = v_customer_id;
  if not found then raise exception 'Address not found'; end if;
  select * into v_zone from public.service_zones where id = v_address.zone_id and active;
  if not found then raise exception 'Delivery zone is inactive'; end if;

  insert into public.orders (customer_id,address_id,zone_id,idempotency_key,category,request_text,delivery_fee_minor,budget_ceiling_minor)
  values (v_customer_id,v_address.id,v_zone.id,p_idempotency_key,trim(p_category),trim(p_request_text),v_zone.delivery_surcharge_minor,p_budget_ceiling_minor)
  on conflict (customer_id,idempotency_key) do nothing returning id into v_order_id;

  if v_order_id is null then
    select id into v_order_id from public.orders
    where customer_id = v_customer_id and idempotency_key = p_idempotency_key
      and address_id = v_address.id and category = trim(p_category)
      and request_text = trim(p_request_text) and budget_ceiling_minor = p_budget_ceiling_minor;
    if v_order_id is null then raise exception 'Idempotency key reused with different order data'; end if;
  else
    insert into public.order_events(order_id,actor_id,event_type,details)
    values (v_order_id,v_customer_id,'order_requested',jsonb_build_object('budget_ceiling_minor',p_budget_ceiling_minor,'delivery_fee_minor',v_zone.delivery_surcharge_minor));
  end if;
  return v_order_id;
end;
$$;
revoke all on function private.create_customer_order(uuid,uuid,text,text,bigint) from public,anon;
grant execute on function private.create_customer_order(uuid,uuid,text,text,bigint) to authenticated;

create function public.create_customer_order(
  p_idempotency_key uuid,p_address_id uuid,p_category text,p_request_text text,p_budget_ceiling_minor bigint
) returns uuid language sql security invoker set search_path = ''
as $$ select private.create_customer_order($1,$2,$3,$4,$5); $$;
revoke all on function public.create_customer_order(uuid,uuid,text,text,bigint) from public,anon;
grant execute on function public.create_customer_order(uuid,uuid,text,text,bigint) to authenticated;

create or replace function private.start_order_shopping(p_order_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id=p_order_id and driver_id=v_actor for update;
  if not found then raise exception 'Assigned order not found'; end if;
  if not exists (select 1 from public.driver_profiles where user_id=v_actor and review_status='approved') then raise exception 'Approved driver required'; end if;
  if v_order.status not in ('accepted','assigned') then raise exception 'Order is not ready for shopping'; end if;
  update public.orders set status='shopping' where id=p_order_id;
  insert into public.order_events(order_id,actor_id,event_type) values (p_order_id,v_actor,'shopping_started');
end;
$$;

create or replace function private.record_order_purchase(p_order_id uuid,p_purchase_amount_minor bigint)
returns text language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_order public.orders%rowtype; v_next_status text;
begin
  if p_purchase_amount_minor is null or p_purchase_amount_minor not between 0 and 100000000 then raise exception 'Invalid purchase amount'; end if;
  select * into v_order from public.orders where id=p_order_id and driver_id=v_actor for update;
  if not found then raise exception 'Assigned order not found'; end if;
  if not exists (select 1 from public.driver_profiles where user_id=v_actor and review_status='approved') then raise exception 'Approved driver required'; end if;
  if v_order.status <> 'shopping' then raise exception 'Order is not being shopped'; end if;
  v_next_status := case when p_purchase_amount_minor <= v_order.budget_ceiling_minor then 'purchased' else 'awaiting_approval' end;
  update public.orders set purchase_amount_minor=p_purchase_amount_minor,status=v_next_status,
    purchased_at=case when v_next_status='purchased' then now() else null end
    where id=p_order_id;
  insert into public.order_events(order_id,actor_id,event_type,details)
  values (p_order_id,v_actor,case when v_next_status='purchased' then 'purchase_recorded' else 'purchase_approval_requested' end,
    jsonb_build_object('purchase_amount_minor',p_purchase_amount_minor,'budget_ceiling_minor',v_order.budget_ceiling_minor));
  return v_next_status;
end;
$$;

create or replace function private.respond_purchase_approval(p_order_id uuid,p_approved boolean)
returns text language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_order public.orders%rowtype; v_next_status text;
begin
  select * into v_order from public.orders where id=p_order_id and customer_id=v_actor for update;
  if not found then raise exception 'Customer order not found'; end if;
  if v_order.status <> 'awaiting_approval' or v_order.purchase_amount_minor is null then raise exception 'No purchase approval is pending'; end if;
  v_next_status := case when p_approved then 'purchased' else 'shopping' end;
  update public.orders set status=v_next_status,
    purchased_at=case when p_approved then now() else null end,
    purchase_amount_minor=case when p_approved then purchase_amount_minor else null end
    where id=p_order_id;
  insert into public.order_events(order_id,actor_id,event_type,details)
  values (p_order_id,v_actor,case when p_approved then 'purchase_approved' else 'purchase_rejected' end,
    jsonb_build_object('purchase_amount_minor',v_order.purchase_amount_minor));
  return v_next_status;
end;
$$;

create or replace function private.start_order_delivery(p_order_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  if not exists (select 1 from public.driver_profiles where user_id=v_actor and review_status='approved') then raise exception 'Approved driver required'; end if;
  update public.orders set status='delivering' where id=p_order_id and driver_id=v_actor and status='purchased';
  if not found then raise exception 'Order is not ready for delivery'; end if;
  insert into public.order_events(order_id,actor_id,event_type) values (p_order_id,v_actor,'delivery_started');
end;
$$;

create or replace function private.issue_delivery_code(p_order_id uuid)
returns table(code text,expires_at timestamptz) language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_code text; v_random bigint; v_expires timestamptz;
begin
  perform 1 from public.orders where id=p_order_id and customer_id=v_actor and status='delivering' for update;
  if not found then raise exception 'Customer order is not being delivered'; end if;
  v_random := (('x'||encode(extensions.gen_random_bytes(4),'hex'))::bit(32)::bigint + 4294967296) % 4294967296;
  v_code := lpad((v_random % 1000000)::text,6,'0');
  v_expires := now() + interval '15 minutes';
  update public.orders set delivery_code_hash=encode(extensions.digest(v_code,'sha256'),'hex'),
    delivery_code_expires_at=v_expires,delivery_code_attempts=0 where id=p_order_id;
  insert into public.order_events(order_id,actor_id,event_type) values (p_order_id,v_actor,'delivery_code_issued');
  return query select v_code,v_expires;
end;
$$;

create or replace function private.confirm_order_delivery(p_order_id uuid,p_code text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id=p_order_id and driver_id=v_actor for update;
  if not found then raise exception 'Assigned order not found'; end if;
  if not exists (select 1 from public.driver_profiles where user_id=v_actor and review_status='approved') then raise exception 'Approved driver required'; end if;
  if v_order.status <> 'delivering' or v_order.delivery_code_hash is null or v_order.delivery_code_expires_at <= now() then raise exception 'Delivery code is missing or expired'; end if;
  if v_order.delivery_code_attempts >= 5 then raise exception 'Delivery code attempt limit reached'; end if;
  if p_code is null or p_code !~ '^[0-9]{6}$' or encode(extensions.digest(p_code,'sha256'),'hex') <> v_order.delivery_code_hash then
    update public.orders set delivery_code_attempts=delivery_code_attempts+1 where id=p_order_id;
    insert into public.order_events(order_id,actor_id,event_type) values (p_order_id,v_actor,'delivery_code_rejected');
    return false;
  end if;
  update public.orders set status='delivered',delivered_at=now(),delivery_code_hash=null,delivery_code_expires_at=null where id=p_order_id;
  insert into public.order_events(order_id,actor_id,event_type,details)
  values (p_order_id,v_actor,'delivery_confirmed',jsonb_build_object('purchase_amount_minor',v_order.purchase_amount_minor,'delivery_fee_minor',v_order.delivery_fee_minor));
  return true;
end;
$$;

revoke all on function private.start_order_shopping(uuid) from public,anon;
revoke all on function private.record_order_purchase(uuid,bigint) from public,anon;
revoke all on function private.respond_purchase_approval(uuid,boolean) from public,anon;
revoke all on function private.start_order_delivery(uuid) from public,anon;
revoke all on function private.issue_delivery_code(uuid) from public,anon;
revoke all on function private.confirm_order_delivery(uuid,text) from public,anon;
grant execute on function private.start_order_shopping(uuid) to authenticated;
grant execute on function private.record_order_purchase(uuid,bigint) to authenticated;
grant execute on function private.respond_purchase_approval(uuid,boolean) to authenticated;
grant execute on function private.start_order_delivery(uuid) to authenticated;
grant execute on function private.issue_delivery_code(uuid) to authenticated;
grant execute on function private.confirm_order_delivery(uuid,text) to authenticated;

create function public.start_order_shopping(p_order_id uuid) returns void language sql security invoker set search_path = '' as $$ select private.start_order_shopping($1); $$;
create function public.record_order_purchase(p_order_id uuid,p_purchase_amount_minor bigint) returns text language sql security invoker set search_path = '' as $$ select private.record_order_purchase($1,$2); $$;
create function public.respond_purchase_approval(p_order_id uuid,p_approved boolean) returns text language sql security invoker set search_path = '' as $$ select private.respond_purchase_approval($1,$2); $$;
create function public.start_order_delivery(p_order_id uuid) returns void language sql security invoker set search_path = '' as $$ select private.start_order_delivery($1); $$;
create function public.issue_delivery_code(p_order_id uuid) returns table(code text,expires_at timestamptz) language sql security invoker set search_path = '' as $$ select * from private.issue_delivery_code($1); $$;
create function public.confirm_order_delivery(p_order_id uuid,p_code text) returns boolean language sql security invoker set search_path = '' as $$ select private.confirm_order_delivery($1,$2); $$;

revoke all on function public.start_order_shopping(uuid) from public,anon;
revoke all on function public.record_order_purchase(uuid,bigint) from public,anon;
revoke all on function public.respond_purchase_approval(uuid,boolean) from public,anon;
revoke all on function public.start_order_delivery(uuid) from public,anon;
revoke all on function public.issue_delivery_code(uuid) from public,anon;
revoke all on function public.confirm_order_delivery(uuid,text) from public,anon;
grant execute on function public.start_order_shopping(uuid) to authenticated;
grant execute on function public.record_order_purchase(uuid,bigint) to authenticated;
grant execute on function public.respond_purchase_approval(uuid,boolean) to authenticated;
grant execute on function public.start_order_delivery(uuid) to authenticated;
grant execute on function public.issue_delivery_code(uuid) to authenticated;
grant execute on function public.confirm_order_delivery(uuid,text) to authenticated;
