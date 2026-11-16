create or replace function public.register_push_token(
  p_expo_push_token text,
  p_platform text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_platform is null or p_platform not in ('ios', 'android') then
    raise exception 'Unsupported push platform' using errcode = '22023';
  end if;

  if p_expo_push_token is null
    or length(p_expo_push_token) > 512
    or p_expo_push_token !~ '^(ExponentPushToken|ExpoPushToken)\[[^]]+\]$' then
    raise exception 'Invalid Expo push token' using errcode = '22023';
  end if;

  insert into public.push_tokens (expo_push_token, user_id, platform, updated_at)
  values (p_expo_push_token, v_user_id, p_platform, pg_catalog.now())
  on conflict (expo_push_token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        updated_at = pg_catalog.now();
end;
$function$;

revoke all on function public.register_push_token(text, text) from public, anon, authenticated;
grant execute on function public.register_push_token(text, text) to authenticated;
