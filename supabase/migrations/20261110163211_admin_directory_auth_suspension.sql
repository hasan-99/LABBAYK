drop function public.admin_list_users();
drop function private.admin_list_users_impl();

create function private.admin_list_users_impl()
returns table (
  user_id uuid,
  email text,
  email_confirmed boolean,
  account_suspended boolean,
  display_name text,
  roles text[],
  driver_status public.driver_review_status,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  return query
  select
    u.id,
    u.email::text,
    u.email_confirmed_at is not null,
    coalesce(u.banned_until > now(), false),
    coalesce(p.display_name, ''),
    coalesce(array_agg(ur.role::text order by ur.role::text)
      filter (where ur.role is not null), array[]::text[]),
    dp.review_status,
    u.created_at,
    u.last_sign_in_at
  from auth.users as u
  left join public.profiles as p on p.id = u.id
  left join public.user_roles as ur on ur.user_id = u.id
  left join public.driver_profiles as dp on dp.user_id = u.id
  group by u.id, u.email, u.email_confirmed_at, u.banned_until, p.display_name,
    dp.review_status, u.created_at, u.last_sign_in_at
  order by u.created_at desc
  limit 500;
end;
$$;

revoke all on function private.admin_list_users_impl() from public, anon, authenticated;
grant execute on function private.admin_list_users_impl() to authenticated;

create function public.admin_list_users()
returns table (
  user_id uuid,
  email text,
  email_confirmed boolean,
  account_suspended boolean,
  display_name text,
  roles text[],
  driver_status public.driver_review_status,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.admin_list_users_impl();
$$;

revoke all on function public.admin_list_users() from public, anon, authenticated;
grant execute on function public.admin_list_users() to authenticated;

comment on function public.admin_list_users() is
  'Returns a limited user directory and Auth suspension flag to authenticated super admins only.';
