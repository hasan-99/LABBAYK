alter table public.orders add column purchase_approved_at timestamptz;
alter table public.orders add constraint orders_purchase_approval_fields_check
  check (purchase_approved_at is null or purchase_amount_minor is not null);
grant select (purchase_approved_at) on public.orders to authenticated;

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
  v_next_status := case when p_purchase_amount_minor > v_order.budget_ceiling_minor then 'awaiting_approval' else 'shopping' end;
  update public.orders set purchase_amount_minor=p_purchase_amount_minor,status=v_next_status,
    purchased_at=null,purchase_approved_at=null where id=p_order_id;
  insert into public.order_events(order_id,actor_id,event_type,details)
  values (p_order_id,v_actor,case when v_next_status='shopping' then 'purchase_amount_proposed_within_budget' else 'purchase_approval_requested' end,
    jsonb_build_object('purchase_amount_minor',p_purchase_amount_minor,'budget_ceiling_minor',v_order.budget_ceiling_minor));
  return v_next_status;
end;
$$;

create or replace function private.respond_purchase_approval(p_order_id uuid,p_approved boolean)
returns text language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id=p_order_id and customer_id=v_actor for update;
  if not found then raise exception 'Customer order not found'; end if;
  if v_order.status <> 'awaiting_approval' or v_order.purchase_amount_minor is null then raise exception 'No purchase approval is pending'; end if;
  update public.orders set status='shopping',purchased_at=null,
    purchase_approved_at=case when p_approved then now() else null end,
    purchase_amount_minor=case when p_approved then purchase_amount_minor else null end
    where id=p_order_id;
  insert into public.order_events(order_id,actor_id,event_type,details)
  values (p_order_id,v_actor,case when p_approved then 'purchase_approved' else 'purchase_rejected' end,
    jsonb_build_object('purchase_amount_minor',v_order.purchase_amount_minor));
  return 'shopping';
end;
$$;

create function private.confirm_order_purchase(p_order_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id=p_order_id and driver_id=v_actor for update;
  if not found then raise exception 'Assigned order not found'; end if;
  if not exists (select 1 from public.driver_profiles where user_id=v_actor and review_status='approved') then raise exception 'Approved driver required'; end if;
  if v_order.status <> 'shopping' or v_order.purchase_amount_minor is null then raise exception 'Purchase amount must be recorded before confirmation'; end if;
  if v_order.purchase_amount_minor > v_order.budget_ceiling_minor and v_order.purchase_approved_at is null then raise exception 'Customer approval is required before purchase'; end if;
  update public.orders set status='purchased',purchased_at=now() where id=p_order_id;
  insert into public.order_events(order_id,actor_id,event_type,details)
  values (p_order_id,v_actor,'purchase_completed',jsonb_build_object('purchase_amount_minor',v_order.purchase_amount_minor));
end;
$$;

revoke all on function private.confirm_order_purchase(uuid) from public,anon;
grant execute on function private.confirm_order_purchase(uuid) to authenticated;
create function public.confirm_order_purchase(p_order_id uuid) returns void language sql security invoker set search_path = '' as $$ select private.confirm_order_purchase($1); $$;
revoke all on function public.confirm_order_purchase(uuid) from public,anon;
grant execute on function public.confirm_order_purchase(uuid) to authenticated;
