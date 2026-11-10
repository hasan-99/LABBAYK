create table public.global_delivery_pricing (
  id smallint primary key default 1 check (id=1),
  base_fee_minor bigint not null default 0 check (base_fee_minor between 0 and 100000000),
  version integer not null default 1 check (version > 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.global_delivery_pricing enable row level security;
create policy global_delivery_pricing_admin_select on public.global_delivery_pricing
  for select to authenticated using ((select private.is_admin()));
revoke all on public.global_delivery_pricing from public,anon,authenticated;
grant select on public.global_delivery_pricing to authenticated;

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 1 and 80),
  entity_type text not null check (char_length(entity_type) between 1 and 60),
  entity_id text not null check (char_length(entity_id) between 1 and 120),
  reason text not null check (char_length(reason) between 5 and 500),
  before_data jsonb not null default '{}'::jsonb check (jsonb_typeof(before_data)='object'),
  after_data jsonb not null default '{}'::jsonb check (jsonb_typeof(after_data)='object'),
  created_at timestamptz not null default now()
);
create index admin_audit_entity_created_idx on public.admin_audit_log(entity_type,entity_id,created_at desc);
alter table public.admin_audit_log enable row level security;
create policy admin_audit_log_admin_select on public.admin_audit_log
  for select to authenticated using ((select private.is_admin()));
revoke all on public.admin_audit_log from public,anon,authenticated;
grant select on public.admin_audit_log to authenticated;

alter table public.orders
  add column base_fee_minor bigint not null default 0 check (base_fee_minor between 0 and 100000000),
  add column zone_surcharge_minor bigint not null default 0 check (zone_surcharge_minor between 0 and 100000000),
  add column pricing_rule_version integer not null default 0 check (pricing_rule_version >= 0);
update public.orders set zone_surcharge_minor=delivery_fee_minor where base_fee_minor=0 and zone_surcharge_minor=0;
grant select (base_fee_minor,zone_surcharge_minor,pricing_rule_version) on public.orders to authenticated;

create or replace function private.create_customer_order(
  p_idempotency_key uuid,p_address_id uuid,p_category text,p_request_text text,p_budget_ceiling_minor bigint
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_customer_id uuid := auth.uid(); v_address public.addresses%rowtype; v_zone public.service_zones%rowtype;
  v_order_id uuid; v_base_fee bigint := 0; v_pricing_version integer := 0; v_total_fee bigint;
begin
  if v_customer_id is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null then raise exception 'Request key is required'; end if;
  if p_category is null or char_length(trim(p_category)) not between 1 and 80 then raise exception 'Invalid category'; end if;
  if p_request_text is null or char_length(trim(p_request_text)) not between 1 and 4000 then raise exception 'Invalid request'; end if;
  if p_budget_ceiling_minor is null or p_budget_ceiling_minor not between 1 and 100000000 then raise exception 'A valid purchase budget is required'; end if;
  select * into v_address from public.addresses where id=p_address_id and user_id=v_customer_id;
  if not found then raise exception 'Address not found'; end if;
  select * into v_zone from public.service_zones where id=v_address.zone_id and active;
  if not found then raise exception 'Delivery zone is inactive'; end if;
  select base_fee_minor,version into v_base_fee,v_pricing_version from public.global_delivery_pricing where id=1;
  if not found then v_base_fee:=0; v_pricing_version:=0; end if;
  v_total_fee := v_base_fee + v_zone.delivery_surcharge_minor;
  if v_total_fee not between 0 and 100000000 then raise exception 'Calculated delivery fee is outside supported limits'; end if;

  insert into public.orders (customer_id,address_id,zone_id,idempotency_key,category,request_text,delivery_fee_minor,
    budget_ceiling_minor,base_fee_minor,zone_surcharge_minor,pricing_rule_version)
  values (v_customer_id,v_address.id,v_zone.id,p_idempotency_key,trim(p_category),trim(p_request_text),v_total_fee,
    p_budget_ceiling_minor,v_base_fee,v_zone.delivery_surcharge_minor,v_pricing_version)
  on conflict (customer_id,idempotency_key) do nothing returning id into v_order_id;
  if v_order_id is null then
    select id into v_order_id from public.orders where customer_id=v_customer_id and idempotency_key=p_idempotency_key
      and address_id=v_address.id and category=trim(p_category) and request_text=trim(p_request_text)
      and budget_ceiling_minor=p_budget_ceiling_minor;
    if v_order_id is null then raise exception 'Idempotency key reused with different order data'; end if;
  else
    insert into public.order_events(order_id,actor_id,event_type,details)
    values (v_order_id,v_customer_id,'order_requested',jsonb_build_object('budget_ceiling_minor',p_budget_ceiling_minor,
      'delivery_fee_minor',v_total_fee,'base_fee_minor',v_base_fee,'zone_surcharge_minor',v_zone.delivery_surcharge_minor,'pricing_rule_version',v_pricing_version));
  end if;
  return v_order_id;
end;
$$;

create function private.set_global_delivery_fee(p_fee_minor bigint,p_reason text)
returns integer language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_before bigint; v_version integer;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_fee_minor is null or p_fee_minor not between 0 and 100000000 then raise exception 'Invalid global fee'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 5 and 500 then raise exception 'A reason is required'; end if;
  select base_fee_minor,version into v_before,v_version from public.global_delivery_pricing where id=1 for update;
  if not found then v_before:=0; v_version:=0; end if;
  v_version:=v_version+1;
  insert into public.global_delivery_pricing(id,base_fee_minor,version,updated_by,updated_at)
  values (1,p_fee_minor,v_version,v_actor,now())
  on conflict (id) do update set base_fee_minor=excluded.base_fee_minor,version=excluded.version,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,reason,before_data,after_data)
  values (v_actor,'set_global_delivery_fee','global_delivery_pricing','1',trim(p_reason),
    jsonb_build_object('base_fee_minor',v_before,'version',v_version-1),jsonb_build_object('base_fee_minor',p_fee_minor,'version',v_version));
  return v_version;
end;
$$;

create function private.set_zone_delivery_surcharge(p_zone_id uuid,p_fee_minor bigint,p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_before bigint;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_fee_minor is null or p_fee_minor not between 0 and 100000000 then raise exception 'Invalid zone surcharge'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 5 and 500 then raise exception 'A reason is required'; end if;
  select delivery_surcharge_minor into v_before from public.service_zones where id=p_zone_id for update;
  if not found then raise exception 'Service zone not found'; end if;
  update public.service_zones set delivery_surcharge_minor=p_fee_minor where id=p_zone_id;
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,reason,before_data,after_data)
  values (v_actor,'set_zone_delivery_surcharge','service_zone',p_zone_id::text,trim(p_reason),
    jsonb_build_object('delivery_surcharge_minor',v_before),jsonb_build_object('delivery_surcharge_minor',p_fee_minor));
end;
$$;

revoke all on function private.set_global_delivery_fee(bigint,text) from public,anon;
revoke all on function private.set_zone_delivery_surcharge(uuid,bigint,text) from public,anon;
grant execute on function private.set_global_delivery_fee(bigint,text) to authenticated;
grant execute on function private.set_zone_delivery_surcharge(uuid,bigint,text) to authenticated;
create function public.set_global_delivery_fee(p_fee_minor bigint,p_reason text) returns integer language sql security invoker set search_path = '' as $$ select private.set_global_delivery_fee($1,$2); $$;
create function public.set_zone_delivery_surcharge(p_zone_id uuid,p_fee_minor bigint,p_reason text) returns void language sql security invoker set search_path = '' as $$ select private.set_zone_delivery_surcharge($1,$2,$3); $$;
revoke all on function public.set_global_delivery_fee(bigint,text) from public,anon;
revoke all on function public.set_zone_delivery_surcharge(uuid,bigint,text) from public,anon;
grant execute on function public.set_global_delivery_fee(bigint,text) to authenticated;
grant execute on function public.set_zone_delivery_surcharge(uuid,bigint,text) to authenticated;
