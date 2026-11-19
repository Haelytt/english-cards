-- One point per module learned perfectly by a user.
create table if not exists public.learned_module_awards (
  user_id uuid not null references auth.users(id) on delete cascade,
  module_id text not null,
  learned_at timestamptz not null default now(),
  primary key (user_id, module_id)
);

create index if not exists learned_module_awards_learned_at_idx
  on public.learned_module_awards (learned_at);

alter table public.learned_module_awards enable row level security;
revoke all on table public.learned_module_awards from anon, authenticated;

-- Preserve perfect-completion marks that existed before the rating was added.
insert into public.learned_module_awards (user_id, module_id, learned_at)
select library.user_id, module.item->>'id', now()
from public.libraries as library
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(library.data)='array' then library.data else '[]'::jsonb end
) as module(item)
where module.item->>'id' is not null
  and lower(coalesce(module.item->>'learnedPerfectly','false'))='true'
on conflict (user_id, module_id) do nothing;

-- Clear a copied module's perfect mark only when its source content changes.
create or replace function public.propagate_friend_module_updates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_module record;
  destination record;
  updated_data jsonb;
begin
  if pg_trigger_depth()>1 or jsonb_typeof(new.data)<>'array' then
    return new;
  end if;

  for source_module in
    select item as module,item->>'id' as module_id
    from jsonb_array_elements(new.data) as module_item(item)
    where item->>'id' is not null
      and lower(coalesce(item->>'addedFromFriend','false'))<>'true'
  loop
    for destination in
      select library.user_id,library.data
      from public.libraries as library
      where library.user_id<>new.user_id
        and library.data @> jsonb_build_array(jsonb_build_object(
          'addedFromFriend',true,
          'addedFromUser',new.user_id::text,
          'addedFromModule',source_module.module_id
        ))
    loop
      select coalesce(jsonb_agg(
        case when item.module->>'addedFromFriend'='true'
                   and item.module->>'addedFromUser'=new.user_id::text
                   and item.module->>'addedFromModule'=source_module.module_id then
          case when item.module->'name' is distinct from source_module.module->'name'
                     or coalesce(item.module->'cards','[]'::jsonb) is distinct from coalesce(source_module.module->'cards','[]'::jsonb) then
            (jsonb_set(
              jsonb_set(item.module,'{name}',coalesce(source_module.module->'name','null'::jsonb),true),
              '{cards}',coalesce(source_module.module->'cards','[]'::jsonb),true
            ) - 'learnedPerfectly')
          else
            jsonb_set(
              jsonb_set(item.module,'{name}',coalesce(source_module.module->'name','null'::jsonb),true),
              '{cards}',coalesce(source_module.module->'cards','[]'::jsonb),true
            )
          end
        else item.module end order by item.ordinality
      ),'[]'::jsonb)
      into updated_data
      from jsonb_array_elements(
        case when jsonb_typeof(destination.data)='array' then destination.data else '[]'::jsonb end
      ) with ordinality as item(module,ordinality);

      if updated_data is distinct from destination.data then
        update public.libraries set data=updated_data where user_id=destination.user_id;
      end if;
    end loop;
  end loop;
  return new;
end;
$$;

create or replace function public.sync_learning_awards()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.learned_module_awards (user_id, module_id, learned_at)
  select current_user_id, module.item->>'id', now()
  from public.libraries as library
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(library.data)='array' then library.data else '[]'::jsonb end
  ) as module(item)
  where library.user_id=current_user_id
    and module.item->>'id' is not null
    and lower(coalesce(module.item->>'learnedPerfectly','false'))='true'
  on conflict (user_id, module_id) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.get_learning_leaderboard(ranking_period text default 'month')
returns table(rank_no bigint, user_id uuid, nickname text, avatar_data text, points bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with scores as (
    select award.user_id, count(*)::bigint as points
    from public.learned_module_awards as award
    where auth.uid() is not null
      and (
        ranking_period='all'
        or award.learned_at >= (date_trunc('month', now() at time zone 'UTC') at time zone 'UTC')
      )
    group by award.user_id
  ), ranked as (
    select row_number() over (
             order by score.points desc, lower(coalesce(profile.nickname,'')), profile.user_id
           ) as rank_no,
           profile.user_id,
           profile.nickname,
           content.avatar_data,
           score.points
    from scores as score
    join public.profiles as profile on profile.user_id=score.user_id
    left join public.profile_content as content on content.user_id=score.user_id
  )
  select ranked.rank_no, ranked.user_id, ranked.nickname, ranked.avatar_data, ranked.points
  from ranked
  where ranked.rank_no <= 50 or ranked.user_id=auth.uid()
  order by ranked.rank_no
$$;

revoke all on function public.sync_learning_awards() from public;
revoke all on function public.get_learning_leaderboard(text) from public;
grant execute on function public.sync_learning_awards() to authenticated;
grant execute on function public.get_learning_leaderboard(text) to authenticated;

notify pgrst, 'reload schema';
