-- Allow the commission policy and its order/settlement snapshots to reach 60%.
alter table public.commission_policies
  drop constraint commission_policies_rate_basis_points_check,
  add constraint commission_policies_rate_basis_points_check
    check (rate_basis_points between 0 and 6000);

alter table public.orders
  drop constraint orders_commission_rate_basis_points_check,
  add constraint orders_commission_rate_basis_points_check
    check (commission_rate_basis_points between 0 and 6000);

alter table public.cash_settlements
  drop constraint cash_settlements_commission_rate_basis_points_check,
  add constraint cash_settlements_commission_rate_basis_points_check
    check (commission_rate_basis_points between 0 and 6000);

create or replace function private.set_commission_rate(p_rate_basis_points integer,p_reason text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_before integer; v_version integer;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_rate_basis_points is null or p_rate_basis_points not between 0 and 6000 then raise exception 'Commission must be between 0 and 6000 basis points'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 5 and 500 then raise exception 'A reason is required'; end if;
  select rate_basis_points,version into v_before,v_version from public.commission_policies where id=1 for update;
  if not found then v_version:=0; end if;
  v_version:=v_version+1;
  insert into public.commission_policies(id,rate_basis_points,version,updated_by,updated_at)
    values(1,p_rate_basis_points,v_version,v_actor,now())
    on conflict(id) do update set rate_basis_points=excluded.rate_basis_points,version=excluded.version,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,reason,before_data,after_data)
    values(v_actor,'set_commission_rate','commission_policy','1',trim(p_reason),
      case when v_before is null then '{}'::jsonb else jsonb_build_object('rate_basis_points',v_before,'version',v_version-1) end,
      jsonb_build_object('rate_basis_points',p_rate_basis_points,'version',v_version));
  return v_version;
end;
$$;

-- Apply the requested policy now; existing orders keep their snapshotted rate.
do $$
declare v_before integer; v_version integer;
begin
  select rate_basis_points,version into v_before,v_version
    from public.commission_policies where id=1 for update;
  if found and v_before <> 6000 then
    v_version := v_version + 1;
    update public.commission_policies
      set rate_basis_points=6000, version=v_version, updated_by=null, updated_at=now()
      where id=1;
    insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,reason,before_data,after_data)
      values(null,'set_commission_rate','commission_policy','1',
        'Owner requested commission rate change to 60 percent',
        jsonb_build_object('rate_basis_points',v_before,'version',v_version-1),
        jsonb_build_object('rate_basis_points',6000,'version',v_version));
  end if;
end;
$$;
