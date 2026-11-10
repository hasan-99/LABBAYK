grant insert (name, governorate, city, neighborhood, active, delivery_surcharge_minor, currency)
  on public.service_zones to authenticated;
grant update (active) on public.service_zones to authenticated;

grant select, insert on public.driver_invites to authenticated;
grant update (revoked_at) on public.driver_invites to authenticated;
