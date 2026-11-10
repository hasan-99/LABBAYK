create table public.order_disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  opened_by uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null unique,
  reason text not null check (char_length(reason) between 3 and 120),
  details text not null check (char_length(details) between 5 and 2000),
  previous_order_status text not null,
  created_at timestamptz not null default now(),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  resolution text check (resolution is null or char_length(resolution) between 5 and 2000),
  check ((resolved_at is null)=(resolution is null))
);
create unique index order_disputes_one_open_per_order_idx on public.order_disputes(order_id) where resolved_at is null;
create index order_disputes_order_created_idx on public.order_disputes(order_id,created_at desc);
create index order_disputes_opened_by_idx on public.order_disputes(opened_by,created_at desc);
alter table public.order_disputes enable row level security;
create policy order_disputes_select_participant_or_admin on public.order_disputes
  for select to authenticated using (
    opened_by=(select auth.uid()) or (select private.is_admin()) or
    exists(select 1 from public.orders o where o.id=order_id and
      (o.customer_id=(select auth.uid()) or o.driver_id=(select auth.uid())))
  );
revoke all on public.order_disputes from public,anon,authenticated;
grant select on public.order_disputes to authenticated;

alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('requested','quoted','searching','accepted','assigned','shopping','awaiting_approval','purchased','delivering','delivered','settled','disputed','cancelled'));

create function private.open_order_dispute(p_order_id uuid,p_reason text,p_details text,p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_order public.orders%rowtype; v_existing public.order_disputes%rowtype; v_dispute_id uuid;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key is required'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 3 and 120 then raise exception 'Choose a valid issue category'; end if;
  if p_details is null or char_length(trim(p_details)) not between 5 and 2000 then raise exception 'Describe the issue in at least five characters'; end if;
  select * into v_existing from public.order_disputes where idempotency_key=p_idempotency_key;
  if found then
    if v_existing.opened_by<>v_actor or v_existing.order_id<>p_order_id or v_existing.reason<>trim(p_reason) or v_existing.details<>trim(p_details) then
      raise exception 'Idempotency key was already used for different dispute details';
    end if;
    return v_existing.id;
  end if;
  select * into v_order from public.orders where id=p_order_id and
    (customer_id=v_actor or driver_id=v_actor) for update;
  if not found then raise exception 'Order not found for this account'; end if;
  if v_order.status not in ('accepted','assigned','shopping','awaiting_approval','purchased','delivering','delivered','settled') then
    raise exception 'This order state cannot be sent to support';
  end if;
  insert into public.order_disputes(order_id,opened_by,idempotency_key,reason,details,previous_order_status)
    values(p_order_id,v_actor,p_idempotency_key,trim(p_reason),trim(p_details),v_order.status)
    returning id into v_dispute_id;
  update public.orders set status='disputed' where id=p_order_id;
  insert into public.order_events(order_id,actor_id,event_type,details)
    values(p_order_id,v_actor,'order_disputed',jsonb_build_object('dispute_id',v_dispute_id,'reason',trim(p_reason)));
  return v_dispute_id;
end;
$$;

create function private.resolve_order_dispute(p_dispute_id uuid,p_resolution text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_dispute public.order_disputes%rowtype;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_resolution is null or char_length(trim(p_resolution)) not between 5 and 2000 then raise exception 'A resolution summary is required'; end if;
  select * into v_dispute from public.order_disputes where id=p_dispute_id and resolved_at is null for update;
  if not found then raise exception 'Open dispute not found'; end if;
  perform 1 from public.orders where id=v_dispute.order_id and status='disputed' for update;
  if not found then raise exception 'Order is no longer in dispute'; end if;
  update public.order_disputes set resolved_by=v_actor,resolved_at=now(),resolution=trim(p_resolution) where id=p_dispute_id;
  update public.orders set status=v_dispute.previous_order_status where id=v_dispute.order_id;
  insert into public.order_events(order_id,actor_id,event_type,details)
    values(v_dispute.order_id,v_actor,'dispute_resolved',jsonb_build_object('dispute_id',v_dispute.id,'resolution',trim(p_resolution)));
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,reason,before_data,after_data)
    values(v_actor,'resolve_order_dispute','order_dispute',v_dispute.id::text,trim(p_resolution),
      jsonb_build_object('status','open','order_status',v_dispute.previous_order_status),
      jsonb_build_object('status','resolved','order_status',v_dispute.previous_order_status));
  return v_dispute.previous_order_status;
end;
$$;

revoke all on function private.open_order_dispute(uuid,text,text,uuid) from public,anon;
revoke all on function private.resolve_order_dispute(uuid,text) from public,anon;
grant execute on function private.open_order_dispute(uuid,text,text,uuid) to authenticated;
grant execute on function private.resolve_order_dispute(uuid,text) to authenticated;
create function public.open_order_dispute(p_order_id uuid,p_reason text,p_details text,p_idempotency_key uuid)
returns uuid language sql security invoker set search_path = '' as $$ select private.open_order_dispute($1,$2,$3,$4); $$;
create function public.resolve_order_dispute(p_dispute_id uuid,p_resolution text)
returns text language sql security invoker set search_path = '' as $$ select private.resolve_order_dispute($1,$2); $$;
revoke all on function public.open_order_dispute(uuid,text,text,uuid) from public,anon;
revoke all on function public.resolve_order_dispute(uuid,text) from public,anon;
grant execute on function public.open_order_dispute(uuid,text,text,uuid) to authenticated;
grant execute on function public.resolve_order_dispute(uuid,text) to authenticated;
