-- Install/replace the friend request RPCs independently of the base schema migration.
create or replace function public.request_friend(target_user uuid)
returns public.friend_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.friend_requests;
begin
  if auth.uid() is null or target_user is null or target_user = auth.uid() then
    raise exception 'Invalid friend request target';
  end if;
  if not exists (select 1 from public.profiles p where p.user_id = target_user) then
    raise exception 'Profile not found';
  end if;

  select * into result
    from public.friend_requests r
    where least(r.sender_id,r.receiver_id)=least(auth.uid(),target_user)
      and greatest(r.sender_id,r.receiver_id)=greatest(auth.uid(),target_user)
    for update;

  if result.id is not null then
    if result.status in ('pending','accepted') then return result; end if;
    update public.friend_requests r
      set sender_id=auth.uid(), receiver_id=target_user, status='pending', updated_at=now()
      where r.id=result.id returning * into result;
    return result;
  end if;

  insert into public.friend_requests(sender_id,receiver_id,status)
    values(auth.uid(),target_user,'pending') returning * into result;
  return result;
end;
$$;

create or replace function public.respond_friend(request_id uuid, accept_request boolean)
returns public.friend_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.friend_requests;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.friend_requests r
    set status=case when accept_request then 'accepted' else 'rejected' end,
        updated_at=now()
    where r.id=request_id and r.receiver_id=auth.uid() and r.status='pending'
    returning * into result;
  if result.id is null then raise exception 'Request not found or already answered'; end if;
  return result;
end;
$$;

revoke all on function public.request_friend(uuid) from public;
revoke all on function public.respond_friend(uuid,boolean) from public;
grant execute on function public.request_friend(uuid) to authenticated;
grant execute on function public.respond_friend(uuid,boolean) to authenticated;
notify pgrst, 'reload schema';
