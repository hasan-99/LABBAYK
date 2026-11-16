create function private.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.notifications
    set read_at = coalesce(read_at, now())
    where recipient_id = auth.uid() and read_at is null;
  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function private.mark_all_notifications_read() from public, anon;
grant execute on function private.mark_all_notifications_read() to authenticated;

create function public.mark_all_notifications_read()
returns integer
language sql
security invoker
set search_path = ''
as $$ select private.mark_all_notifications_read(); $$;

revoke all on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_all_notifications_read() to authenticated;
