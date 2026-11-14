-- Public searchable profiles and private friend requests.
-- Execute as project owner in the Supabase SQL Editor.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(btrim(nickname)) between 2 and 24),
  nickname_search text generated always as (lower(btrim(nickname))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists profiles_nickname_search_uidx on public.profiles(nickname_search);

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(user_id) on delete cascade,
  receiver_id uuid not null references public.profiles(user_id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friend_requests_not_self check (sender_id <> receiver_id)
);
create unique index if not exists friend_requests_one_pair_uidx
  on public.friend_requests (least(sender_id, receiver_id), greatest(sender_id, receiver_id));
create index if not exists friend_requests_receiver_status_idx on public.friend_requests(receiver_id,status,created_at desc);
create index if not exists friend_requests_sender_status_idx on public.friend_requests(sender_id,status,created_at desc);

create or replace function public.sync_profile_from_auth()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare nick text;
begin
  nick := nullif(btrim(new.raw_user_meta_data ->> 'nickname'), '');
  if nick is null then nick := split_part(coalesce(new.email, 'user'), '@', 1); end if;
  nick := left(nick, 24);
  if char_length(nick) < 2 then nick := 'user' || left(new.id::text, 8); end if;
  insert into public.profiles(user_id,nickname,updated_at) values(new.id,nick,now())
  on conflict(user_id) do update set nickname = excluded.nickname, updated_at = now();
  return new;
end;
$$;
drop trigger if exists on_auth_user_profile_sync on auth.users;
create trigger on_auth_user_profile_sync after insert on auth.users
for each row execute function public.sync_profile_from_auth();

insert into public.profiles(user_id,nickname)
select u.id,left(coalesce(nullif(btrim(u.raw_user_meta_data ->> 'nickname'),''),nullif(split_part(coalesce(u.email,''),'@',1),''),'user'||left(u.id::text,8)),24)
from auth.users u on conflict(user_id) do nothing;

alter table public.profiles enable row level security;
alter table public.friend_requests enable row level security;
drop policy if exists "Authenticated users can search profiles" on public.profiles;
drop policy if exists "Users update their own profile" on public.profiles;
drop policy if exists "Participants read friend requests" on public.friend_requests;
drop policy if exists "Users send requests as themselves" on public.friend_requests;
drop policy if exists "Recipients respond to pending requests" on public.friend_requests;
drop policy if exists "Senders cancel pending requests" on public.friend_requests;
create policy "Authenticated users can search profiles" on public.profiles
for select to authenticated using (true);
create policy "Users update their own profile" on public.profiles
for update to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "Participants read friend requests" on public.friend_requests
for select to authenticated using (auth.uid()=sender_id or auth.uid()=receiver_id);
create policy "Users send requests as themselves" on public.friend_requests
for insert to authenticated with check (auth.uid()=sender_id and sender_id<>receiver_id and status='pending');
create policy "Recipients respond to pending requests" on public.friend_requests
for update to authenticated using (auth.uid()=receiver_id and status='pending')
with check (auth.uid()=receiver_id and status in ('accepted','rejected'));
create policy "Senders cancel pending requests" on public.friend_requests
for delete to authenticated using (auth.uid()=sender_id and status='pending');
grant select on public.profiles to authenticated;
grant update(nickname) on public.profiles to authenticated;
grant select,insert,update,delete on public.friend_requests to authenticated;

create or replace function public.request_friend(target_user uuid)
returns public.friend_requests
language plpgsql security definer set search_path = ''
as $$
declare result public.friend_requests;
begin
  if auth.uid() is null or target_user = auth.uid() then
    raise exception 'invalid friend request target';
  end if;
  insert into public.friend_requests(sender_id,receiver_id,status)
  values(auth.uid(),target_user,'pending')
  on conflict (least(sender_id, receiver_id), greatest(sender_id, receiver_id))
  do update set sender_id = excluded.sender_id, receiver_id = excluded.receiver_id,
    status = 'pending', updated_at = now()
  where public.friend_requests.status in ('rejected','cancelled');
  select * into result from public.friend_requests
    where least(sender_id,receiver_id)=least(auth.uid(),target_user)
      and greatest(sender_id,receiver_id)=greatest(auth.uid(),target_user);
  return result;
end;
$$;

create or replace function public.respond_friend(request_id uuid, accept_request boolean)
returns public.friend_requests
language plpgsql security definer set search_path = ''
as $$
declare result public.friend_requests;
begin
  update public.friend_requests
    set status = case when accept_request then 'accepted' else 'rejected' end,
        updated_at = now()
    where id = request_id and receiver_id = auth.uid() and status = 'pending'
    returning * into result;
  if result.id is null then raise exception 'request not found or already answered'; end if;
  return result;
end;
$$;
revoke all on function public.request_friend(uuid) from public;
revoke all on function public.respond_friend(uuid,boolean) from public;
grant execute on function public.request_friend(uuid) to authenticated;
grant execute on function public.respond_friend(uuid,boolean) to authenticated;
