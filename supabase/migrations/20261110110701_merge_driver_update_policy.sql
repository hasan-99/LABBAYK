drop policy driver_profiles_admin_update on public.driver_profiles;
drop policy driver_profiles_update_self_vehicle on public.driver_profiles;
create policy driver_profiles_update_owner_or_admin on public.driver_profiles
  for update to authenticated
  using (
    (select private.is_admin())
    or (user_id = (select auth.uid()) and review_status in ('pending', 'approved'))
  )
  with check (
    (select private.is_admin())
    or (user_id = (select auth.uid()) and review_status in ('pending', 'approved'))
  );
