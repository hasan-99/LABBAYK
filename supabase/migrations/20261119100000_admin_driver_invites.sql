-- Admin-created driver invites. The token is generated and hashed on the server, so the
-- mobile admin never needs client-side crypto. An invite created this way is the admin's
-- approval: redeeming it makes the signed-in user an approved driver immediately.
alter table public.driver_invites add column if not exists auto_approve boolean not null default false;

create or replace function private.admin_create_driver_invite()
returns text language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_token text; v_id uuid;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.driver_invites(token_hash, expires_at, created_by, auto_approve)
    values (encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '7 days', v_actor, true)
    returning id into v_id;
  insert into public.admin_audit_log(actor_id, action, entity_type, entity_id, reason, before_data, after_data)
    values (v_actor, 'create_driver_invite', 'driver_invite', v_id::text, 'دعوة سائق جديد',
      '{}'::jsonb, jsonb_build_object('auto_approve', true));
  return v_token;
end;
$$;

create or replace function private.redeem_driver_invite(p_token text, p_vehicle_description text default null)
returns public.driver_review_status language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := auth.uid(); v_invite public.driver_invites%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if char_length(trim(coalesce(p_token, ''))) < 32 then raise exception 'Invalid invite'; end if;
  if p_vehicle_description is not null and char_length(trim(p_vehicle_description)) > 160 then raise exception 'Vehicle description is too long'; end if;
  if exists (select 1 from public.driver_profiles where user_id = v_user_id) then raise exception 'Driver application already exists'; end if;
  select * into v_invite from public.driver_invites where token_hash = encode(extensions.digest(trim(p_token), 'sha256'), 'hex')
    and redeemed_at is null and revoked_at is null and expires_at > now() for update;
  if not found then raise exception 'Invite is invalid, expired, or already used'; end if;
  update public.driver_invites set redeemed_by = v_user_id, redeemed_at = now() where id = v_invite.id;
  if v_invite.auto_approve then
    insert into public.driver_profiles(user_id, vehicle_description, review_status, approved_at, approved_by)
      values (v_user_id, nullif(trim(p_vehicle_description), ''), 'approved', now(), v_invite.created_by);
    insert into public.user_roles(user_id, role) values (v_user_id, 'driver') on conflict do nothing;
    return 'approved'::public.driver_review_status;
  end if;
  insert into public.driver_profiles(user_id, vehicle_description, review_status) values (v_user_id, nullif(trim(p_vehicle_description), ''), 'pending');
  insert into public.user_roles(user_id, role) values (v_user_id, 'driver_pending') on conflict do nothing;
  return 'pending'::public.driver_review_status;
end;
$$;

create function public.admin_create_driver_invite()
returns text language sql security invoker set search_path = '' as $$ select private.admin_create_driver_invite(); $$;

revoke all on function private.admin_create_driver_invite() from public, anon;
revoke all on function public.admin_create_driver_invite() from public, anon;
grant execute on function private.admin_create_driver_invite() to authenticated;
grant execute on function public.admin_create_driver_invite() to authenticated;
