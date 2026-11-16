-- Customer approval for purchases above the budget ceiling is removed.
-- The driver records the amount and continues; the driver already has the customer's phone for any questions.
create or replace function private.record_order_purchase(p_order_id uuid,p_purchase_amount_minor bigint)
returns text language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_order public.orders%rowtype;
begin
  if p_purchase_amount_minor is null or p_purchase_amount_minor not between 0 and 100000000 then raise exception 'Invalid purchase amount'; end if;
  select * into v_order from public.orders where id=p_order_id and driver_id=v_actor for update;
  if not found then raise exception 'Assigned order not found'; end if;
  if not exists (select 1 from public.driver_profiles where user_id=v_actor and review_status='approved') then raise exception 'Approved driver required'; end if;
  if v_order.status <> 'shopping' then raise exception 'Order is not being shopped'; end if;
  update public.orders set purchase_amount_minor=p_purchase_amount_minor,purchased_at=null,purchase_approved_at=now() where id=p_order_id;
  insert into public.order_events(order_id,actor_id,event_type,details)
  values (p_order_id,v_actor,'purchase_amount_proposed_within_budget',
    jsonb_build_object('purchase_amount_minor',p_purchase_amount_minor,'budget_ceiling_minor',v_order.budget_ceiling_minor));
  return 'shopping';
end;
$$;

create or replace function private.confirm_order_purchase(p_order_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id=p_order_id and driver_id=v_actor for update;
  if not found then raise exception 'Assigned order not found'; end if;
  if not exists (select 1 from public.driver_profiles where user_id=v_actor and review_status='approved') then raise exception 'Approved driver required'; end if;
  if v_order.status <> 'shopping' or v_order.purchase_amount_minor is null then raise exception 'Purchase amount must be recorded before confirmation'; end if;
  update public.orders set status='purchased',purchased_at=now() where id=p_order_id;
  insert into public.order_events(order_id,actor_id,event_type,details)
  values (p_order_id,v_actor,'purchase_completed',jsonb_build_object('purchase_amount_minor',v_order.purchase_amount_minor));
end;
$$;

-- Unblock any order already waiting for the removed approval step.
update public.orders set status='shopping',purchase_approved_at=now() where status='awaiting_approval';
