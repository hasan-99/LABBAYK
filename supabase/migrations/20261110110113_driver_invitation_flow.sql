create policy driver_profiles_update_self_vehicle on public.driver_profiles
  for update to authenticated
  using (user_id = (select auth.uid()) and review_status in ('pending', 'approved'))
  with check (user_id = (select auth.uid()) and review_status in ('pending', 'approved'));
grant update (vehicle_description) on public.driver_profiles to authenticated;

create or replace function public.redeem_driver_invite(p_token text, p_vehicle_description text default null)
returns public.driver_review_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite public.driver_invites%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if char_length(trim(coalesce(p_token, ''))) < 32 then raise exception 'Invalid invite'; end if;
  if p_vehicle_description is not null and char_length(trim(p_vehicle_description)) > 160 then raise exception 'Vehicle description is too long'; end if;
  if exists (select 1 from public.driver_profiles where user_id = v_user_id) then raise exception 'Driver application already exists'; end if;

  select * into v_invite from public.driver_invites
  where token_hash = encode(extensions.digest(trim(p_token), 'sha256'), 'hex')
    and redeemed_at is null and revoked_at is null and expires_at > now()
  for update;
  if not found then raise exception 'Invite is invalid, expired, or already used'; end if;

  update public.driver_invites set redeemed_by = v_user_id, redeemed_at = now() where id = v_invite.id;
  insert into public.driver_profiles(user_id, vehicle_description, review_status)
  values (v_user_id, nullif(trim(p_vehicle_description), ''), 'pending');
  insert into public.user_roles(user_id, role) values (v_user_id, 'driver_pending') on conflict do nothing;
  return 'pending'::public.driver_review_status;
end;
$$;
revoke all on function public.redeem_driver_invite(text, text) from public, anon;
grant execute on function public.redeem_driver_invite(text, text) to authenticated;

create or replace function public.review_driver_application(p_user_id uuid, p_approved boolean)
returns public.driver_review_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.driver_review_status;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if p_approved then
    update public.driver_profiles
      set review_status = 'approved', approved_at = now(), approved_by = auth.uid()
      where user_id = p_user_id and review_status = 'pending'
      returning review_status into v_status;
    if not found then raise exception 'Pending application not found'; end if;
    delete from public.user_roles where user_id = p_user_id and role = 'driver_pending';
    insert into public.user_roles(user_id, role) values (p_user_id, 'driver') on conflict do nothing;
  else
    update public.driver_profiles
      set review_status = 'rejected', approved_at = null, approved_by = null
      where user_id = p_user_id and review_status = 'pending'
      returning review_status into v_status;
    if not found then raise exception 'Pending application not found'; end if;
    delete from public.user_roles where user_id = p_user_id and role = 'driver_pending';
  end if;
  return v_status;
end;
$$;
revoke all on function public.review_driver_application(uuid, boolean) from public, anon;
grant execute on function public.review_driver_application(uuid, boolean) to authenticated;
