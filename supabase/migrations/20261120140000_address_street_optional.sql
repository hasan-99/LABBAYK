-- The address form no longer asks for a street / house number, floor or building.
-- Expand step: street becomes optional (older app builds keep sending it, which still works).
alter table public.addresses alter column street drop not null;
alter table public.addresses drop constraint if exists addresses_street_check;
alter table public.addresses add constraint addresses_street_check
  check (street is null or char_length(street) <= 160);
