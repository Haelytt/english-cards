-- Public profile details for signed-in users. Module descriptions remain private.
alter table public.profile_content
  add column if not exists badge text;

create or replace function public.get_public_profile(target_user uuid)
returns table(user_id uuid,nickname text,avatar_data text,bio text,badge text)
language sql
stable
security definer
set search_path = ''
as $$
  select profile.user_id,profile.nickname,content.avatar_data,coalesce(content.bio,''),content.badge
  from public.profiles profile
  left join public.profile_content content on content.user_id=profile.user_id
  where auth.uid() is not null and profile.user_id=target_user;
$$;

create or replace function public.get_public_user_modules(target_user uuid)
returns table(module_id text,module_name text,cards jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(module.module->>'id',md5(coalesce(module.module->>'name','')||':'||module.ordinality::text)),
         coalesce(module.module->>'name','Без названия'),
         coalesce(module.module->'cards','[]'::jsonb)
  from public.libraries library
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(library.data)='array' then library.data else '[]'::jsonb end
  ) with ordinality as module(module,ordinality)
  where auth.uid() is not null
    and library.user_id=target_user
    and lower(coalesce(module.module->>'addedFromFriend','false'))<>'true'
    and lower(coalesce(module.module->>'added_from_friend','false'))<>'true'
    and not exists (
      select 1
      from public.libraries other_library
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(other_library.data)='array' then other_library.data else '[]'::jsonb end
      ) as other_item(module)
      where other_library.user_id<>library.user_id
        and lower(coalesce(other_item.module->>'addedFromFriend','false'))<>'true'
        and other_item.module->>'name'=module.module->>'name'
        and coalesce(other_item.module->'cards','[]'::jsonb)=coalesce(module.module->'cards','[]'::jsonb)
    );
$$;

create or replace function public.get_public_user_friends(target_user uuid)
returns table(user_id uuid,nickname text,avatar_data text)
language sql
stable
security definer
set search_path = ''
as $$
  select profile.user_id,profile.nickname,content.avatar_data
  from public.friend_requests friendship
  join public.profiles profile
    on profile.user_id=case when friendship.sender_id=target_user then friendship.receiver_id else friendship.sender_id end
  left join public.profile_content content on content.user_id=profile.user_id
  where auth.uid() is not null
    and friendship.status='accepted'
    and (friendship.sender_id=target_user or friendship.receiver_id=target_user)
    and exists(select 1 from public.profiles owner_profile where owner_profile.user_id=target_user);
$$;

revoke all on function public.get_public_profile(uuid) from public;
revoke all on function public.get_public_user_modules(uuid) from public;
revoke all on function public.get_public_user_friends(uuid) from public;
grant execute on function public.get_public_profile(uuid) to authenticated;
grant execute on function public.get_public_user_modules(uuid) to authenticated;
grant execute on function public.get_public_user_friends(uuid) to authenticated;
notify pgrst, 'reload schema';
