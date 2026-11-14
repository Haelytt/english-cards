-- Check nickname availability during sign-up without exposing the profiles table.
create or replace function public.nickname_available(target_nickname text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.profiles p
    where p.nickname_search = lower(btrim(target_nickname))
  );
$$;

revoke all on function public.nickname_available(text) from public;
grant execute on function public.nickname_available(text) to anon, authenticated;

notify pgrst, 'reload schema';
