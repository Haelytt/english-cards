-- Backfill source references on older imported copies when a single exact
-- match exists among the user's accepted friends.
with candidates as (
  select target.user_id as target_user,
         target_item.ordinality as item_order,
         source.user_id as source_user,
         source_item.module->>'id' as source_module
  from public.libraries target
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(target.data)='array' then target.data else '[]'::jsonb end
  ) with ordinality as target_item(module,ordinality)
  join public.friend_requests friendship
    on friendship.status='accepted'
   and (friendship.sender_id=target.user_id or friendship.receiver_id=target.user_id)
  join public.libraries source
    on source.user_id=case when friendship.sender_id=target.user_id then friendship.receiver_id else friendship.sender_id end
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(source.data)='array' then source.data else '[]'::jsonb end
  ) as source_item(module)
  where lower(coalesce(target_item.module->>'addedFromFriend','false'))='true'
    and (target_item.module->>'addedFromUser' is null or target_item.module->>'addedFromModule' is null)
    and source_item.module->>'id' is not null
    and lower(coalesce(source_item.module->>'addedFromFriend','false'))<>'true'
    and lower(btrim(regexp_replace(target_item.module->>'name','^.* ' || chr(183) || ' ','')))
        = lower(btrim(source_item.module->>'name'))
    and coalesce(target_item.module->'cards','[]'::jsonb)
        = coalesce(source_item.module->'cards','[]'::jsonb)
), counted as (
  select candidates.*,
         count(*) over(partition by target_user,item_order) as match_count
  from candidates
), unique_matches as (
  select target_user,item_order,source_user,source_module
  from counted where match_count=1
)
update public.libraries target
set data=(
  select coalesce(jsonb_agg(
    case when matched.source_user is not null then
      jsonb_set(
        jsonb_set(item.module,'{addedFromUser}',to_jsonb(matched.source_user::text),true),
        '{addedFromModule}',to_jsonb(matched.source_module),true
      )
    else item.module end order by item.ordinality
  ),'[]'::jsonb)
  from jsonb_array_elements(
    case when jsonb_typeof(target.data)='array' then target.data else '[]'::jsonb end
  ) with ordinality as item(module,ordinality)
  left join unique_matches matched
    on matched.target_user=target.user_id and matched.item_order=item.ordinality
)
where exists (
  select 1 from unique_matches matched where matched.target_user=target.user_id
);

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
  -- Destination writes made by this trigger must not fan out again.
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
      from public.libraries library
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
          jsonb_set(
            jsonb_set(item.module,'{name}',coalesce(source_module.module->'name','null'::jsonb),true),
            '{cards}',coalesce(source_module.module->'cards','[]'::jsonb),true
          )
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

revoke all on function public.propagate_friend_module_updates() from public;
drop trigger if exists propagate_friend_module_updates on public.libraries;
create trigger propagate_friend_module_updates
after insert or update of data on public.libraries
for each row execute function public.propagate_friend_module_updates();

do $$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname='supabase_realtime' and schemaname='public' and tablename='libraries'
     ) then
    alter publication supabase_realtime add table public.libraries;
  end if;
end
$$;

notify pgrst, 'reload schema';
