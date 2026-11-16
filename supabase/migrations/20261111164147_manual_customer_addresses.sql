alter table public.addresses
  alter column zone_id drop not null;

create or replace function private.validate_address_zone()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_zone public.service_zones%rowtype;
begin
  if new.zone_id is null then
    return new;
  end if;

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
