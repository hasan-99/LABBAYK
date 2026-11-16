alter table public.driver_profiles
  add column phone_e164 text
    constraint driver_profiles_phone_e164_format
    check (phone_e164 is null or phone_e164 ~ '^\+9639[0-9]{8}$'),
  add column age smallint
    constraint driver_profiles_age_range
    check (age is null or age between 18 and 80);

grant update (phone_e164, age) on public.driver_profiles to authenticated;

alter table public.driver_profiles
  add constraint driver_profiles_contact_required_when_online
  check (not is_online or (phone_e164 is not null and age between 18 and 80));