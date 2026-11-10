create or replace function private.redeem_driver_invite(p_token text,p_vehicle_description text default null)
returns public.driver_review_status language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid:=auth.uid(); v_invite public.driver_invites%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if char_length(trim(coalesce(p_token,'')))<32 then raise exception 'Invalid invite'; end if;
  if p_vehicle_description is not null and char_length(trim(p_vehicle_description))>160 then raise exception 'Vehicle description is too long'; end if;
  if exists(select 1 from public.driver_profiles where user_id=v_user_id) then raise exception 'Driver application already exists'; end if;
  select * into v_invite from public.driver_invites where token_hash=encode(extensions.digest(trim(p_token),'sha256'),'hex')
    and redeemed_at is null and revoked_at is null and expires_at>now() for update;
  if not found then raise exception 'Invite is invalid, expired, or already used'; end if;
  update public.driver_invites set redeemed_by=v_user_id,redeemed_at=now() where id=v_invite.id;
  insert into public.driver_profiles(user_id,vehicle_description,review_status) values(v_user_id,nullif(trim(p_vehicle_description),''),'pending');
  insert into public.user_roles(user_id,role) values(v_user_id,'driver_pending') on conflict do nothing;
  return 'pending'::public.driver_review_status;
end;
$$;

create or replace function private.review_driver_application(p_user_id uuid,p_approved boolean)
returns public.driver_review_status language plpgsql security definer set search_path = ''
as $$
declare v_status public.driver_review_status;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_approved then
    update public.driver_profiles set review_status='approved',approved_at=now(),approved_by=auth.uid()
    where user_id=p_user_id and review_status='pending' returning review_status into v_status;
    if not found then raise exception 'Pending application not found'; end if;
    delete from public.user_roles where user_id=p_user_id and role='driver_pending';
    insert into public.user_roles(user_id,role) values(p_user_id,'driver') on conflict do nothing;
  else
    update public.driver_profiles set review_status='rejected',approved_at=null,approved_by=null
    where user_id=p_user_id and review_status='pending' returning review_status into v_status;
    if not found then raise exception 'Pending application not found'; end if;
    delete from public.user_roles where user_id=p_user_id and role='driver_pending';
  end if;
  return v_status;
end;
$$;

create or replace function private.dispatch_order(p_order_id uuid)
returns integer language plpgsql security definer set search_path = ''
as $$
declare v_order public.orders%rowtype; v_count integer;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status not in ('requested','searching') or v_order.driver_id is not null then raise exception 'Order is not ready for dispatch'; end if;
  update public.order_offers set status='expired',responded_at=now() where order_id=v_order.id and status='pending';
  select count(*) into v_count from public.driver_profiles where service_zone_id=v_order.zone_id and review_status='approved' and is_online;
  if v_count=0 then raise exception 'No approved online drivers in this zone'; end if;
  insert into public.order_offers(order_id,driver_id,expires_at)
  select v_order.id,dp.user_id,now()+interval '90 seconds' from public.driver_profiles dp
  where dp.service_zone_id=v_order.zone_id and dp.review_status='approved' and dp.is_online
  on conflict(order_id,driver_id) do update set status='pending',expires_at=excluded.expires_at,created_at=now(),responded_at=null
    where public.order_offers.status<>'accepted';
  update public.orders set status='searching' where id=v_order.id;
  insert into public.order_events(order_id,actor_id,event_type,details)
  values(v_order.id,auth.uid(),'offers_dispatched',jsonb_build_object('eligible_driver_count',v_count));
  return v_count;
end;
$$;

create or replace function private.accept_order_offer(p_offer_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_driver_id uuid:=auth.uid(); v_offer public.order_offers%rowtype; v_order public.orders%rowtype;
begin
  if v_driver_id is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.user_roles ur join public.driver_profiles dp on dp.user_id=ur.user_id
    where ur.user_id=v_driver_id and ur.role='driver' and dp.review_status='approved' and dp.is_online) then raise exception 'Approved online driver access required'; end if;
  select * into v_offer from public.order_offers where id=p_offer_id and driver_id=v_driver_id and status='pending' and expires_at>now() for update;
  if not found then raise exception 'Offer expired or unavailable'; end if;
  select * into v_order from public.orders where id=v_offer.order_id for update;
  if not found or v_order.status<>'searching' or v_order.driver_id is not null then raise exception 'Another driver already accepted this order'; end if;
  update public.orders set status='accepted',driver_id=v_driver_id where id=v_order.id;
  update public.order_offers set status='accepted',responded_at=now() where id=v_offer.id;
  update public.order_offers set status='revoked',responded_at=now() where order_id=v_order.id and id<>v_offer.id and status='pending';
  insert into public.order_events(order_id,actor_id,event_type) values(v_order.id,v_driver_id,'driver_accepted');
  return v_order.id;
end;
$$;

create function private.decline_order_offer(p_offer_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid:=auth.uid(); v_order_id uuid;
begin
  if not exists(select 1 from public.driver_profiles where user_id=v_actor and review_status='approved') then raise exception 'Approved driver required'; end if;
  update public.order_offers set status='declined',responded_at=now()
    where id=p_offer_id and driver_id=v_actor and status='pending' and expires_at>now() returning order_id into v_order_id;
  if not found then raise exception 'Offer expired or unavailable'; end if;
  insert into public.order_events(order_id,actor_id,event_type) values(v_order_id,v_actor,'driver_declined_offer');
end;
$$;

create function private.cancel_customer_order(p_order_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid:=auth.uid(); v_order public.orders%rowtype;
begin
  if p_reason is null or char_length(trim(p_reason)) not between 3 and 300 then raise exception 'A cancellation reason is required'; end if;
  select * into v_order from public.orders where id=p_order_id and customer_id=v_actor for update;
  if not found then raise exception 'Customer order not found'; end if;
  if v_order.status not in ('requested','searching','accepted','assigned','shopping','awaiting_approval')
     or (v_order.status='shopping' and v_order.purchase_amount_minor is not null) then raise exception 'Order cannot be cancelled in its current state'; end if;
  update public.order_offers set status='revoked',responded_at=coalesce(responded_at,now())
    where order_id=p_order_id and status in ('pending','accepted');
  update public.orders set status='cancelled',driver_id=null,purchase_amount_minor=null,purchase_approved_at=null where id=p_order_id;
  insert into public.order_events(order_id,actor_id,event_type,details)
  values(p_order_id,v_actor,'customer_cancelled',jsonb_build_object('reason',trim(p_reason),'previous_status',v_order.status));
end;
$$;

create function private.cancel_admin_order(p_order_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid:=auth.uid(); v_order public.orders%rowtype;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 5 and 500 then raise exception 'A cancellation reason is required'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status not in ('requested','searching','accepted','assigned','shopping','awaiting_approval')
     or (v_order.status='shopping' and v_order.purchase_amount_minor is not null) then raise exception 'Order requires a dispute instead of cancellation'; end if;
  update public.order_offers set status='revoked',responded_at=coalesce(responded_at,now())
    where order_id=p_order_id and status in ('pending','accepted');
  update public.orders set status='cancelled',driver_id=null,purchase_amount_minor=null,purchase_approved_at=null where id=p_order_id;
  insert into public.order_events(order_id,actor_id,event_type,details)
  values(p_order_id,v_actor,'admin_cancelled',jsonb_build_object('reason',trim(p_reason),'previous_status',v_order.status));
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,reason,before_data,after_data)
  values(v_actor,'cancel_order','order',p_order_id::text,trim(p_reason),jsonb_build_object('status',v_order.status),jsonb_build_object('status','cancelled'));
end;
$$;

revoke all on function private.redeem_driver_invite(text,text) from public,anon;
revoke all on function private.review_driver_application(uuid,boolean) from public,anon;
revoke all on function private.dispatch_order(uuid) from public,anon;
revoke all on function private.accept_order_offer(uuid) from public,anon;
revoke all on function private.decline_order_offer(uuid) from public,anon;
revoke all on function private.cancel_customer_order(uuid,text) from public,anon;
revoke all on function private.cancel_admin_order(uuid,text) from public,anon;
grant execute on function private.redeem_driver_invite(text,text) to authenticated;
grant execute on function private.review_driver_application(uuid,boolean) to authenticated;
grant execute on function private.dispatch_order(uuid) to authenticated;
grant execute on function private.accept_order_offer(uuid) to authenticated;
grant execute on function private.decline_order_offer(uuid) to authenticated;
grant execute on function private.cancel_customer_order(uuid,text) to authenticated;
grant execute on function private.cancel_admin_order(uuid,text) to authenticated;

create or replace function public.redeem_driver_invite(p_token text,p_vehicle_description text default null)
returns public.driver_review_status language sql security invoker set search_path = '' as $$ select private.redeem_driver_invite($1,$2); $$;
create or replace function public.review_driver_application(p_user_id uuid,p_approved boolean)
returns public.driver_review_status language sql security invoker set search_path = '' as $$ select private.review_driver_application($1,$2); $$;
create or replace function public.dispatch_order(p_order_id uuid)
returns integer language sql security invoker set search_path = '' as $$ select private.dispatch_order($1); $$;
create or replace function public.accept_order_offer(p_offer_id uuid)
returns uuid language sql security invoker set search_path = '' as $$ select private.accept_order_offer($1); $$;
create function public.decline_order_offer(p_offer_id uuid) returns void language sql security invoker set search_path = '' as $$ select private.decline_order_offer($1); $$;
create function public.cancel_customer_order(p_order_id uuid,p_reason text) returns void language sql security invoker set search_path = '' as $$ select private.cancel_customer_order($1,$2); $$;
create function public.cancel_admin_order(p_order_id uuid,p_reason text) returns void language sql security invoker set search_path = '' as $$ select private.cancel_admin_order($1,$2); $$;

revoke all on function public.redeem_driver_invite(text,text) from public,anon;
revoke all on function public.review_driver_application(uuid,boolean) from public,anon;
revoke all on function public.dispatch_order(uuid) from public,anon;
revoke all on function public.accept_order_offer(uuid) from public,anon;
revoke all on function public.decline_order_offer(uuid) from public,anon;
revoke all on function public.cancel_customer_order(uuid,text) from public,anon;
revoke all on function public.cancel_admin_order(uuid,text) from public,anon;
grant execute on function public.redeem_driver_invite(text,text) to authenticated;
grant execute on function public.review_driver_application(uuid,boolean) to authenticated;
grant execute on function public.dispatch_order(uuid) to authenticated;
grant execute on function public.accept_order_offer(uuid) to authenticated;
grant execute on function public.decline_order_offer(uuid) to authenticated;
grant execute on function public.cancel_customer_order(uuid,text) to authenticated;
grant execute on function public.cancel_admin_order(uuid,text) to authenticated;
