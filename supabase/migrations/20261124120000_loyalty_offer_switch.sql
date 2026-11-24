-- Admin on/off switch for the loyalty discount offer, plus the "coming soon"
-- text shown to customers while the offer is off.
-- Points keep being earned either way; only redeeming a discount on NEW orders
-- is blocked while the offer is off. Orders already created keep their discount.

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
