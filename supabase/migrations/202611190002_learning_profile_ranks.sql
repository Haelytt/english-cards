-- Return the signed-in user's monthly and all-time positions for a profile view.
create or replace function public.get_learning_user_ranks(target_user uuid)
returns table(month_rank bigint, all_time_rank bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with scores as (
    select award.user_id,
           count(*) filter (
             where award.learned_at >= (date_trunc('month', now() at time zone 'UTC') at time zone 'UTC')
           )::bigint as month_points,
           count(*)::bigint as all_points
    from public.learned_module_awards as award
    where auth.uid() is not null
    group by award.user_id
  ), month_ranked as (
    select row_number() over (
             order by score.month_points desc, lower(coalesce(profile.nickname,'')), profile.user_id
           ) as rank_no,
           score.user_id
    from scores as score
    join public.profiles as profile on profile.user_id=score.user_id
    where score.month_points > 0
  ), all_ranked as (
    select row_number() over (
             order by score.all_points desc, lower(coalesce(profile.nickname,'')), profile.user_id
           ) as rank_no,
           score.user_id
    from scores as score
    join public.profiles as profile on profile.user_id=score.user_id
  )
  select month_ranked.rank_no, all_ranked.rank_no
  from public.profiles as viewer
  left join month_ranked on month_ranked.user_id=viewer.user_id
  left join all_ranked on all_ranked.user_id=viewer.user_id
  where viewer.user_id=target_user and auth.uid() is not null
$$;

revoke all on function public.get_learning_user_ranks(uuid) from public;
grant execute on function public.get_learning_user_ranks(uuid) to authenticated;

notify pgrst, 'reload schema';
