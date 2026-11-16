-- Private, per-user profile content shared across the user's devices.
create table if not exists public.profile_content (
  user_id uuid primary key references auth.users(id) on delete cascade,
  avatar_data text,
  bio text not null default '',
  updated_at timestamptz not null default now(),
  constraint profile_content_bio_length check (char_length(bio) <= 116),
  constraint profile_content_avatar_data_format check (
    avatar_data is null or (
      char_length(avatar_data) <= 400000
      and avatar_data like 'data:image/jpeg;base64,%'
    )
  )
);

alter table public.profile_content enable row level security;
drop policy if exists "Users manage their own profile content" on public.profile_content;
create policy "Users manage their own profile content" on public.profile_content
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.profile_content to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'profile_content'
     ) then
    alter publication supabase_realtime add table public.profile_content;
  end if;
end
$$;

notify pgrst, 'reload schema';
