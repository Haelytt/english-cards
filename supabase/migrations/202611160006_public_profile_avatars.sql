-- Make profile photos visible to signed-in site users while keeping bio private.
create or replace function public.get_profile_avatars(target_users uuid[])
returns table(user_id uuid, avatar_data text)
language sql
stable
security definer
set search_path = ''
as $$
  select content.user_id,content.avatar_data
  from public.profile_content content
  where auth.uid() is not null
    and content.user_id=any(coalesce(target_users,array[]::uuid[]))
    and content.avatar_data is not null
    and exists (
      select 1 from public.profiles profile
      where profile.user_id=content.user_id
    );
$$;
revoke all on function public.get_profile_avatars(uuid[]) from public;
grant execute on function public.get_profile_avatars(uuid[]) to authenticated;
notify pgrst, 'reload schema';
