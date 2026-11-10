create or replace function private.validate_address_zone()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_zone public.service_zones%rowtype;
begin
  select * into v_zone
  from public.service_zones
  where id = new.zone_id;

  if not found or not v_zone.active then
    raise exception 'Address must belong to an active service zone' using errcode = '23514';
  end if;

  if lower(btrim(new.governorate)) <> lower(btrim(v_zone.governorate))
     or lower(btrim(new.city)) <> lower(btrim(v_zone.city))
     or lower(btrim(new.neighborhood)) <> lower(btrim(coalesce(v_zone.neighborhood, v_zone.name))) then
    raise exception 'Address location must match its service zone' using errcode = '23514';
  end if;

  return new;
end;
$$;
revoke all on function private.validate_address_zone() from public, anon, authenticated;

create trigger addresses_validate_zone
  before insert or update of zone_id, governorate, city, neighborhood
  on public.addresses
  for each row execute function private.validate_address_zone();
