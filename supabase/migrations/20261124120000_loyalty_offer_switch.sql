-- Admin on/off switch for the loyalty discount offer, plus the "coming soon"
-- text shown to customers while the offer is off.
-- While the offer is off, no new points are earned and discounts cannot be redeemed on NEW orders.
-- Orders already created keep their discount; cancelled orders still get redeemed points back.

create table public.app_offers (
  id smallint primary key check (id = 1),
  loyalty_enabled boolean not null default true,
  coming_soon_text text not null default 'ترقبوا عروضاً جديدة قريباً.' check (char_length(coming_soon_text) between 1 and 300),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.app_offers(id) values (1);

alter table public.app_offers enable row level security;
create policy app_offers_read on public.app_offers for select to authenticated using (true);
revoke all on public.app_offers from public, anon, authenticated;
grant select on public.app_offers to authenticated;

create or replace function private.set_loyalty_offer(p_enabled boolean,p_coming_soon_text text,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_before public.app_offers%rowtype; v_text text := trim(coalesce(p_coming_soon_text,''));
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_enabled is null then raise exception 'Enabled flag is required'; end if;
  if char_length(v_text) not between 1 and 300 then raise exception 'Coming soon text must be 1 to 300 characters'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 5 and 500 then raise exception 'A reason is required'; end if;
  select * into v_before from public.app_offers where id = 1 for update;
  update public.app_offers set loyalty_enabled = p_enabled, coming_soon_text = v_text,
    updated_by = v_actor, updated_at = now() where id = 1;
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,reason,before_data,after_data)
    values(v_actor,'set_loyalty_offer','app_offer','1',trim(p_reason),
      jsonb_build_object('loyalty_enabled',v_before.loyalty_enabled,'coming_soon_text',v_before.coming_soon_text),
      jsonb_build_object('loyalty_enabled',p_enabled,'coming_soon_text',v_text));
end;
$$;
revoke all on function private.set_loyalty_offer(boolean,text,text) from public, anon;
grant execute on function private.set_loyalty_offer(boolean,text,text) to authenticated;

create or replace function public.set_loyalty_offer(p_enabled boolean,p_coming_soon_text text,p_reason text)
returns void language sql security invoker set search_path = '' as $$
  select private.set_loyalty_offer($1,$2,$3);
$$;
revoke all on function public.set_loyalty_offer(boolean,text,text) from public, anon;
grant execute on function public.set_loyalty_offer(boolean,text,text) to authenticated;

-- Block redeeming points on a NEW order while the offer is off. Idempotent
-- retries of an existing order return before reaching an insert, so they are unaffected.
create or replace function private.require_loyalty_offer_enabled()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.loyalty_discount_tier_points > 0
     and not coalesce((select loyalty_enabled from public.app_offers where id = 1), true) then
    raise exception 'The loyalty offer is not active right now';
  end if;
  return new;
end;
$$;
revoke all on function private.require_loyalty_offer_enabled() from public, anon, authenticated;
create trigger orders_require_loyalty_offer_enabled
  before insert on public.orders
  for each row execute function private.require_loyalty_offer_enabled();

-- While the offer is off, completed orders no longer earn points.
-- Refunding redeemed points on cancellation is unaffected.
create or replace function private.apply_customer_loyalty_status_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_inserted integer; v_event_id bigint;
begin
  if old.status is distinct from new.status and new.status in ('delivered','settled') and new.customer_id is not null
     and coalesce((select loyalty_enabled from public.app_offers where id = 1), true) then
    insert into public.customer_loyalty_accounts(customer_id) values(new.customer_id) on conflict(customer_id) do nothing;
    insert into public.customer_loyalty_ledger(customer_id,order_id,event_type,points_delta)
      values(new.customer_id,new.id,'earned',1) on conflict(order_id,event_type) where order_id is not null do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted > 0 then
      update public.customer_loyalty_accounts set points_balance=points_balance+1,
        lifetime_points_earned=lifetime_points_earned+1,updated_at=now() where customer_id=new.customer_id;
      insert into public.order_events(order_id,actor_id,event_type,details)
        values(new.id,new.driver_id,'loyalty_point_earned',jsonb_build_object('points',1)) returning id into v_event_id;
      update public.notifications set title='كسبت نقطة لَبّيك',body='أضفنا نقطة إلى رصيدك بعد اكتمال الطلب.'
        where recipient_id=new.customer_id and source_event_id=v_event_id;
    end if;
  end if;
  if old.status is distinct from new.status and new.status='cancelled' and new.loyalty_points_redeemed>0 and new.customer_id is not null then
    insert into public.customer_loyalty_accounts(customer_id) values(new.customer_id) on conflict(customer_id) do nothing;
    insert into public.customer_loyalty_ledger(customer_id,order_id,event_type,points_delta)
      values(new.customer_id,new.id,'refund',new.loyalty_points_redeemed)
      on conflict(order_id,event_type) where order_id is not null do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted > 0 then
      update public.customer_loyalty_accounts set points_balance=points_balance+new.loyalty_points_redeemed,updated_at=now()
        where customer_id=new.customer_id;
      insert into public.order_events(order_id,actor_id,event_type,details)
        values(new.id,auth.uid(),'loyalty_points_refunded',jsonb_build_object('points',new.loyalty_points_redeemed)) returning id into v_event_id;
      insert into public.notifications(recipient_id,order_id,source_event_id,event_type,title,body)
        values(new.customer_id,new.id,v_event_id,'loyalty_points_refunded','رجعت نقاطك إلى رصيدك','أعدنا نقاط لَبّيك المستخدمة لأن الطلب أُلغي.')
        on conflict(recipient_id,source_event_id) where source_event_id is not null
        do update set title=excluded.title,body=excluded.body;
    end if;
  end if;
  return new;
end;
$$;

-- public.orders only exposes explicitly granted columns to clients. The loyalty
-- columns added in 20261124073203 were never granted, so any client select that
-- lists them fails with "permission denied". RLS still limits which rows are visible.
grant select (loyalty_points_redeemed, loyalty_discount_minor, loyalty_discount_tier_points)
  on public.orders to authenticated;
