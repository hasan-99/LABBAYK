-- Remove stale broad grants on existing public tables. RLS is not a substitute
-- for least-privilege SQL grants (for example, TRUNCATE bypasses RLS).
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT ON public.service_zones TO anon;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public FROM authenticated;

-- Restore only the direct writes used by the client applications.
GRANT INSERT, UPDATE, DELETE ON public.addresses TO authenticated;
GRANT UPDATE (display_name) ON public.profiles TO authenticated;
GRANT INSERT (created_by, expires_at, token_hash) ON public.driver_invites TO authenticated;
GRANT UPDATE (revoked_at) ON public.driver_invites TO authenticated;
GRANT UPDATE (is_online) ON public.driver_profiles TO authenticated;
GRANT INSERT (name, governorate, city, neighborhood, active, delivery_surcharge_minor, currency)
  ON public.service_zones TO authenticated;
GRANT UPDATE (active) ON public.service_zones TO authenticated;

-- These column grants were added in earlier migrations. Remove fields that
-- are now managed only by trusted RPCs, including driver approval and dispatch.
REVOKE UPDATE (review_status, approved_at, approved_by, service_zone_id,
               vehicle_description, user_id, created_at, updated_at)
  ON public.driver_profiles FROM authenticated;
REVOKE UPDATE (status) ON public.orders FROM authenticated;
REVOKE INSERT (id, display_name, created_at, updated_at) ON public.profiles FROM authenticated;
REVOKE INSERT (user_id, role, created_at), UPDATE (user_id, role, created_at)
  ON public.user_roles FROM authenticated;

-- Keep future tables from inheriting Supabase's broad Data API role grants.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated, service_role;
