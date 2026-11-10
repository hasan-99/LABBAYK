create index addresses_zone_id_idx on public.addresses (zone_id);
create index driver_invites_created_by_idx on public.driver_invites (created_by);
create index driver_invites_redeemed_by_idx on public.driver_invites (redeemed_by);
create index driver_profiles_approved_by_idx on public.driver_profiles (approved_by);

create unique index user_roles_single_super_admin
  on public.user_roles (role) where role = 'super_admin'::public.app_role;

drop policy driver_profiles_admin_manage on public.driver_profiles;
create policy driver_profiles_admin_insert on public.driver_profiles
  for insert to authenticated with check ((select private.is_admin()));
create policy driver_profiles_admin_update on public.driver_profiles
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy driver_profiles_admin_delete on public.driver_profiles
  for delete to authenticated using ((select private.is_admin()));

drop policy service_zones_admin_manage on public.service_zones;
create policy service_zones_admin_insert on public.service_zones
  for insert to authenticated with check ((select private.is_admin()));
create policy service_zones_admin_update on public.service_zones
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy service_zones_admin_delete on public.service_zones
  for delete to authenticated using ((select private.is_admin()));
