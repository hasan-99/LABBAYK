-- The app reads orders directly through PostgREST. RLS still determines which
-- rows each signed-in customer, driver, or admin may see.
GRANT SELECT ON public.orders TO authenticated;
