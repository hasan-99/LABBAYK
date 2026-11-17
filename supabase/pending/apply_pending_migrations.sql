-- =====================================================================
-- لَبّيك: الهجرات المعلّقة في ملف واحد (للصق في Supabase > SQL Editor)
-- =====================================================================
-- الخطوة 1: شغّل أولاً استعلام الفحص التالي لتعرف أي الهجرات مطبّقة.
-- الخطوة 2: شغّل فقط أقسام الهجرات التي تظهر عندها applied = false،
--           قسماً قسماً وبالترتيب (لا تشغّل قسماً مطبّقاً لأن بعض أوامره غير قابلة للتكرار).
-- هذا الملف نسخة للقراءة؛ المصدر الحقيقي هو مجلد supabase/migrations.
-- =====================================================================

-- ---------- استعلام الفحص ----------
select '1) التسليم بالصورة' as migration,
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='delivery_proof_path') as applied
union all select '2) إزالة موافقة المبلغ',
  coalesce((select prosrc not like '%awaiting_approval%' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='record_order_purchase' limit 1), false)
union all select '3) إسناد مباشر كعرض',
  coalesce((select prosrc like '%single_driver%' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='admin_price_and_dispatch_order' limit 1), false)
union all select '4) اتصال العميل بالسائق',
  to_regprocedure('public.get_order_driver_contact(uuid)') is not null
union all select '5) المبلغ المستلم',
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='cash_collected_minor')
union all select '6) ملاحظة التسليم',
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='delivery_note');


-- =====================================================================
-- القسم 1) التسليم بالصورة   [20261116231707_delivery_photo_proof.sql]
-- =====================================================================
-- Delivery is confirmed by the assigned driver with a photo instead of a customer-held code.
alter table public.orders add column if not exists delivery_proof_path text;
grant select (delivery_proof_path) on public.orders to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('delivery-proofs', 'delivery-proofs', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy delivery_proofs_driver_upload
on storage.objects for insert to authenticated
with check (
  bucket_id = 'delivery-proofs'
  and array_length(storage.foldername(name), 1) = 1
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and exists (
    select 1 from public.orders o
    where o.id = case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((storage.foldername(name))[1])::uuid
    end
      and o.driver_id = (select auth.uid())
      and o.status = 'delivering'
  )
);

create policy delivery_proofs_participant_read
on storage.objects for select to authenticated
using (
  bucket_id = 'delivery-proofs'
  and array_length(storage.foldername(name), 1) = 1
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and exists (
    select 1 from public.orders o
    where o.id = case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((storage.foldername(name))[1])::uuid
    end
      and (o.customer_id = (select auth.uid())
        or o.driver_id = (select auth.uid())
        or (select private.is_admin()))
  )
);

create or replace function private.confirm_order_delivery_with_photo(p_order_id uuid, p_proof_path text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id and driver_id = v_actor for update;
  if not found then raise exception 'Assigned order not found'; end if;
  if not exists (select 1 from public.driver_profiles where user_id = v_actor and review_status = 'approved') then
    raise exception 'Approved driver required';
  end if;
  if v_order.status <> 'delivering' then raise exception 'Order is not out for delivery'; end if;
  if p_proof_path is null or p_proof_path !~ ('^' || p_order_id::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'Invalid delivery photo path';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'delivery-proofs' and name = p_proof_path) then
    raise exception 'Delivery photo is missing';
  end if;
  update public.orders
    set status = 'delivered', delivered_at = now(), delivery_proof_path = p_proof_path,
        delivery_code_hash = null, delivery_code_expires_at = null
    where id = p_order_id;
  insert into public.order_events(order_id, actor_id, event_type, details)
  values (p_order_id, v_actor, 'delivery_confirmed',
    jsonb_build_object('purchase_amount_minor', v_order.purchase_amount_minor,
      'delivery_fee_minor', v_order.delivery_fee_minor, 'proof_path', p_proof_path));
end;
$$;

create function public.confirm_order_delivery_with_photo(p_order_id uuid, p_proof_path text)
returns void language sql security invoker set search_path = ''
as $$ select private.confirm_order_delivery_with_photo($1, $2); $$;

revoke all on function private.confirm_order_delivery_with_photo(uuid, text) from public, anon;
revoke all on function public.confirm_order_delivery_with_photo(uuid, text) from public, anon;
grant execute on function private.confirm_order_delivery_with_photo(uuid, text) to authenticated;
grant execute on function public.confirm_order_delivery_with_photo(uuid, text) to authenticated;


-- =====================================================================
-- القسم 2) إزالة موافقة العميل على المبلغ   [20261116231737_remove_purchase_approval.sql]
-- =====================================================================
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


-- =====================================================================
-- القسم 3) الإسناد المباشر كعرض لسائق واحد (قبول/رفض)   [20261117100000_direct_assign_as_driver_offer.sql]
-- =====================================================================
-- Direct assignment now sends a one-driver offer that the driver can accept or decline (10 minute window),
-- instead of assigning the order immediately.
create or replace function private.admin_price_and_dispatch_order(
  p_order_id uuid,
  p_fee_minor bigint,
  p_driver_id uuid,
  p_reason text
) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_rate integer;
  v_version integer;
  v_count integer := 0;
  v_previous_fee bigint;
  v_previous_status text;
  v_reason text := coalesce(nullif(trim(p_reason),''),'تحديد أجرة التوصيل');
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_fee_minor is null or p_fee_minor not between 0 and 100000000 then raise exception 'Invalid delivery quote'; end if;
  if char_length(coalesce(trim(p_reason),'')) > 500 then raise exception 'Reason is too long'; end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status not in ('requested','quoted','searching') or v_order.driver_id is not null then
    raise exception 'Order is not ready for pricing or dispatch';
  end if;
  select rate_basis_points,version into v_rate,v_version from public.commission_policies where id=1;
  if not found then raise exception 'Set the commission policy before dispatching orders'; end if;

  update public.order_offers set status='expired',responded_at=now()
    where order_id=p_order_id and status='pending';
  v_previous_fee := v_order.delivery_fee_minor;
  v_previous_status := v_order.status;
  update public.orders set delivery_fee_minor=p_fee_minor,base_fee_minor=0,zone_surcharge_minor=0,
    pricing_rule_version=0,delivery_quote_set_at=now(),delivery_quote_set_by=v_actor,
    commission_rate_basis_points=coalesce(commission_rate_basis_points,v_rate),
    commission_policy_version=coalesce(commission_policy_version,v_version),status='quoted'
    where id=p_order_id returning * into v_order;

  insert into public.order_events(order_id,actor_id,event_type,details)
    values(p_order_id,v_actor,'delivery_quote_set',jsonb_build_object(
      'delivery_fee_minor',p_fee_minor,'reason',v_reason,'customer_approval_required',false
    ));
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,reason,before_data,after_data)
    values(v_actor,'set_order_delivery_quote','order',p_order_id::text,v_reason,
      jsonb_build_object('delivery_fee_minor',v_previous_fee,'status',v_previous_status),
      jsonb_build_object('delivery_fee_minor',p_fee_minor,'dispatch_driver_id',p_driver_id));

  if p_driver_id is not null then
    if not exists (
      select 1 from public.driver_profiles dp
      join public.user_roles ur on ur.user_id=dp.user_id and ur.role='driver'
      where dp.user_id=p_driver_id and dp.review_status='approved' and dp.is_online
    ) then raise exception 'Selected driver is not available'; end if;
    insert into public.order_offers(order_id,driver_id,expires_at)
      values(p_order_id,p_driver_id,now()+interval '10 minutes')
      on conflict(order_id,driver_id) do update set status='pending',expires_at=excluded.expires_at,created_at=now(),responded_at=null
        where public.order_offers.status<>'accepted';
    update public.orders set status='searching' where id=p_order_id;
    insert into public.order_events(order_id,actor_id,event_type,details)
      values(p_order_id,v_actor,'offers_dispatched',jsonb_build_object(
        'eligible_driver_count',1,'commission_rate_basis_points',v_order.commission_rate_basis_points,
        'dispatch_mode','single_driver','driver_id',p_driver_id,'first_accept_wins',true
      ));
    insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,reason,before_data,after_data)
      values(v_actor,'offer_order_to_driver','order',p_order_id::text,v_reason,
        jsonb_build_object('status','quoted'),jsonb_build_object('status','searching','driver_id',p_driver_id));
    return 1;
  end if;

  select count(*) into v_count
  from public.driver_profiles dp
  join public.user_roles ur on ur.user_id=dp.user_id and ur.role='driver'
  where dp.review_status='approved' and dp.is_online;
  if v_count=0 then return 0; end if;

  insert into public.order_offers(order_id,driver_id,expires_at)
    select p_order_id,dp.user_id,now()+interval '10 minutes'
    from public.driver_profiles dp
    join public.user_roles ur on ur.user_id=dp.user_id and ur.role='driver'
    where dp.review_status='approved' and dp.is_online
    on conflict(order_id,driver_id) do update set status='pending',expires_at=excluded.expires_at,created_at=now(),responded_at=null
      where public.order_offers.status<>'accepted';
  update public.orders set status='searching' where id=p_order_id;
  insert into public.order_events(order_id,actor_id,event_type,details)
    values(p_order_id,v_actor,'offers_dispatched',jsonb_build_object(
      'eligible_driver_count',v_count,'commission_rate_basis_points',v_order.commission_rate_basis_points,
      'dispatch_mode','all_available_drivers','first_accept_wins',true
    ));
  return v_count;
end;
$$;


-- =====================================================================
-- القسم 4) اسم السائق ورقمه للعميل   [20261117110000_customer_order_driver_contact.sql]
-- =====================================================================
-- Lets a customer see the name and phone of the driver assigned to their own order.
create or replace function private.get_order_driver_contact(p_order_id uuid)
returns table(display_name text, phone text)
language plpgsql security definer set search_path = ''
as $$
begin
  return query
  select coalesce(nullif(trim(p.display_name), ''), 'السائق'), dp.phone_e164
  from public.orders o
  join public.profiles p on p.id = o.driver_id
  left join public.driver_profiles dp on dp.user_id = o.driver_id
  where o.id = p_order_id
    and o.customer_id = auth.uid()
    and o.driver_id is not null
    and o.status in ('accepted', 'assigned', 'shopping', 'awaiting_approval', 'purchased', 'delivering', 'delivered', 'settled');
end;
$$;

create function public.get_order_driver_contact(p_order_id uuid)
returns table(display_name text, phone text)
language sql security invoker set search_path = ''
as $$ select * from private.get_order_driver_contact($1); $$;

revoke all on function private.get_order_driver_contact(uuid) from public, anon;
revoke all on function public.get_order_driver_contact(uuid) from public, anon;
grant execute on function private.get_order_driver_contact(uuid) to authenticated;
grant execute on function public.get_order_driver_contact(uuid) to authenticated;


-- =====================================================================
-- القسم 5) المبلغ المستلم من الزبون   [20261117120000_delivery_cash_collected.sql]
-- =====================================================================
-- The driver records the cash actually received from the customer when finishing the delivery
-- (purchases + delivery fee, plus any tip). Admins see it next to the purchase amount and budget.
alter table public.orders add column if not exists cash_collected_minor bigint
  check (cash_collected_minor is null or cash_collected_minor between 0 and 100000000);
grant select (cash_collected_minor) on public.orders to authenticated;

drop function if exists public.confirm_order_delivery_with_photo(uuid, text);
drop function if exists private.confirm_order_delivery_with_photo(uuid, text);

create or replace function private.confirm_order_delivery_with_photo(p_order_id uuid, p_proof_path text, p_cash_collected_minor bigint default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_order public.orders%rowtype;
begin
  if p_cash_collected_minor is not null and p_cash_collected_minor not between 0 and 100000000 then
    raise exception 'Invalid collected amount';
  end if;
  select * into v_order from public.orders where id = p_order_id and driver_id = v_actor for update;
  if not found then raise exception 'Assigned order not found'; end if;
  if not exists (select 1 from public.driver_profiles where user_id = v_actor and review_status = 'approved') then
    raise exception 'Approved driver required';
  end if;
  if v_order.status <> 'delivering' then raise exception 'Order is not out for delivery'; end if;
  if p_proof_path is null or p_proof_path !~ ('^' || p_order_id::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'Invalid delivery photo path';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'delivery-proofs' and name = p_proof_path) then
    raise exception 'Delivery photo is missing';
  end if;
  update public.orders
    set status = 'delivered', delivered_at = now(), delivery_proof_path = p_proof_path,
        cash_collected_minor = p_cash_collected_minor,
        delivery_code_hash = null, delivery_code_expires_at = null
    where id = p_order_id;
  insert into public.order_events(order_id, actor_id, event_type, details)
  values (p_order_id, v_actor, 'delivery_confirmed',
    jsonb_build_object('purchase_amount_minor', v_order.purchase_amount_minor,
      'delivery_fee_minor', v_order.delivery_fee_minor, 'proof_path', p_proof_path,
      'cash_collected_minor', p_cash_collected_minor));
end;
$$;

create function public.confirm_order_delivery_with_photo(p_order_id uuid, p_proof_path text, p_cash_collected_minor bigint default null)
returns void language sql security invoker set search_path = ''
as $$ select private.confirm_order_delivery_with_photo($1, $2, $3); $$;

revoke all on function private.confirm_order_delivery_with_photo(uuid, text, bigint) from public, anon;
revoke all on function public.confirm_order_delivery_with_photo(uuid, text, bigint) from public, anon;
grant execute on function private.confirm_order_delivery_with_photo(uuid, text, bigint) to authenticated;
grant execute on function public.confirm_order_delivery_with_photo(uuid, text, bigint) to authenticated;


-- =====================================================================
-- القسم 6) ملاحظة التسليم   [20261117130000_delivery_note.sql]
-- =====================================================================
-- The driver can add an optional note when confirming delivery (shown to admins).
alter table public.orders add column if not exists delivery_note text
  check (delivery_note is null or char_length(delivery_note) <= 500);
grant select (delivery_note) on public.orders to authenticated;

drop function if exists public.confirm_order_delivery_with_photo(uuid, text, bigint);
drop function if exists private.confirm_order_delivery_with_photo(uuid, text, bigint);

create or replace function private.confirm_order_delivery_with_photo(p_order_id uuid, p_proof_path text, p_cash_collected_minor bigint default null, p_note text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_order public.orders%rowtype;
begin
  if p_cash_collected_minor is not null and p_cash_collected_minor not between 0 and 100000000 then
    raise exception 'Invalid collected amount';
  end if;
  if char_length(coalesce(p_note, '')) > 500 then raise exception 'Note is too long'; end if;
  select * into v_order from public.orders where id = p_order_id and driver_id = v_actor for update;
  if not found then raise exception 'Assigned order not found'; end if;
  if not exists (select 1 from public.driver_profiles where user_id = v_actor and review_status = 'approved') then
    raise exception 'Approved driver required';
  end if;
  if v_order.status <> 'delivering' then raise exception 'Order is not out for delivery'; end if;
  if p_proof_path is null or p_proof_path !~ ('^' || p_order_id::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'Invalid delivery photo path';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'delivery-proofs' and name = p_proof_path) then
    raise exception 'Delivery photo is missing';
  end if;
  update public.orders
    set status = 'delivered', delivered_at = now(), delivery_proof_path = p_proof_path,
        cash_collected_minor = p_cash_collected_minor, delivery_note = nullif(trim(coalesce(p_note, '')), ''),
        delivery_code_hash = null, delivery_code_expires_at = null
    where id = p_order_id;
  insert into public.order_events(order_id, actor_id, event_type, details)
  values (p_order_id, v_actor, 'delivery_confirmed',
    jsonb_build_object('purchase_amount_minor', v_order.purchase_amount_minor,
      'delivery_fee_minor', v_order.delivery_fee_minor, 'proof_path', p_proof_path,
      'cash_collected_minor', p_cash_collected_minor, 'note', nullif(trim(coalesce(p_note, '')), '')));
end;
$$;

create function public.confirm_order_delivery_with_photo(p_order_id uuid, p_proof_path text, p_cash_collected_minor bigint default null, p_note text default null)
returns void language sql security invoker set search_path = ''
as $$ select private.confirm_order_delivery_with_photo($1, $2, $3, $4); $$;

revoke all on function private.confirm_order_delivery_with_photo(uuid, text, bigint, text) from public, anon;
revoke all on function public.confirm_order_delivery_with_photo(uuid, text, bigint, text) from public, anon;
grant execute on function private.confirm_order_delivery_with_photo(uuid, text, bigint, text) to authenticated;
grant execute on function public.confirm_order_delivery_with_photo(uuid, text, bigint, text) to authenticated;
