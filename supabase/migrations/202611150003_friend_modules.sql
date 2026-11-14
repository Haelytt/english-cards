-- Friends may read module names and card data only after an accepted friendship.
create or replace function public.get_friend_modules(target_user uuid)
returns table(module_id text, module_name text, cards jsonb)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or target_user = auth.uid() then
    raise exception 'Invalid friend profile';
  end if;
  if not exists (
    select 1 from public.friend_requests r
    where r.status='accepted'
      and least(r.sender_id,r.receiver_id)=least(auth.uid(),target_user)
      and greatest(r.sender_id,r.receiver_id)=greatest(auth.uid(),target_user)
  ) then raise exception 'Friendship required'; end if;

  return query
  select coalesce(m->>'id', md5(coalesce(m->>'name','') || ':' || ord::text)),
         coalesce(m->>'name','Без названия'),
         coalesce(m->'cards','[]'::jsonb)
  from public.libraries l
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(l.data)='array' then l.data else '[]'::jsonb end
  ) with ordinality as items(m,ord)
  where l.user_id=target_user;
end;
$$;
revoke all on function public.get_friend_modules(uuid) from public;
grant execute on function public.get_friend_modules(uuid) to authenticated;
notify pgrst, 'reload schema';
