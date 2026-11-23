alter table public.profiles
  add constraint profiles_avatar_path_owner_folder_check
  check (
    avatar_path is null
    or (
      char_length(avatar_path) <= 160
      and avatar_path !~ '(^/|\.\.)'
      and avatar_path ~ ('^' || id::text || '/[^/]+$')
    )
  );
