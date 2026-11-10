create or replace function private.admin_update_user_profile(
  p_user_id uuid,
  p_display_name text,
  p_vehicle_description text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before_name text;
  v_before_vehicle text;
  v_name text := btrim(coalesce(p_display_name, ''));
  v_vehicle text := nullif(btrim(p_vehicle_description), '');
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not private.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_user_id is null then raise exception 'User id is required'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 120 then
    raise exception 'Display name must be between 1 and 120 characters';
  end if;
  if v_vehicle is not null and char_length(v_vehicle) > 160 then
    raise exception 'Vehicle description must be 160 characters or fewer';
  end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'A reason of 5 to 500 characters is required';
  end if;

  select p.display_name into v_before_name
  from public.profiles as p
  where p.id = p_user_id
  for update;
  if not found then raise exception 'User profile not found'; end if;

  select dp.vehicle_description into v_before_vehicle
  from public.driver_profiles as dp
  where dp.user_id = p_user_id
  for update;

  if v_before_name is not distinct from v_name
    and v_before_vehicle is not distinct from v_vehicle then
    return;
  end if;

  update public.profiles set display_name = v_name where id = p_user_id;
  update public.driver_profiles set vehicle_description = v_vehicle where user_id = p_user_id;

  insert into public.admin_audit_log(actor_id, action, entity_type, entity_id, reason, before_data, after_data)
  values (
    auth.uid(),
    'update_user_profile',
    'user',
    p_user_id::text,
    v_reason,
    jsonb_build_object('display_name', v_before_name, 'vehicle_description', v_before_vehicle),
    jsonb_build_object('display_name', v_name, 'vehicle_description', v_vehicle)
  );
end;
$$;

revoke all on function private.admin_update_user_profile(uuid, text, text, text) from public, anon;
grant execute on function private.admin_update_user_profile(uuid, text, text, text) to authenticated;

create or replace function public.admin_update_user_profile(
  p_user_id uuid,
  p_display_name text,
  p_vehicle_description text,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.admin_update_user_profile($1, $2, $3, $4);
$$;

revoke all on function public.admin_update_user_profile(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_update_user_profile(uuid, text, text, text) to authenticated;
