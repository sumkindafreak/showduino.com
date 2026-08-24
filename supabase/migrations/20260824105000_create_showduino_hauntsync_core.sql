create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Showduino Creator' check (char_length(display_name) between 1 and 60),
  haunt_name text check (haunt_name is null or char_length(haunt_name) <= 100),
  bio text check (bio is null or char_length(bio) <= 500),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled Show' check (char_length(name) between 1 and 120),
  format text not null default 'showduino-production',
  format_version integer not null default 1 check (format_version > 0),
  project_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  device_type text not null check (char_length(device_type) between 1 and 60),
  identifier text not null check (char_length(identifier) between 1 and 120),
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, identifier)
);

create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 60),
  author_haunt text check (author_haunt is null or char_length(author_haunt) <= 100),
  title text not null check (char_length(title) between 1 and 120),
  content text not null check (char_length(content) between 1 and 5000),
  category text not null default 'general' check (category in ('general','build-log','show-design','code-control','props-fx','lighting-audio','help-wanted','showcase')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 60),
  content text not null check (char_length(content) between 1 and 2500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_user_updated_idx on public.projects(user_id, updated_at desc);
create index devices_user_created_idx on public.devices(user_id, created_at desc);
create index community_posts_created_idx on public.community_posts(created_at desc);
create index community_posts_category_created_idx on public.community_posts(category, created_at desc);
create index community_comments_post_created_idx on public.community_comments(post_id, created_at asc);

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger projects_set_updated_at before update on public.projects for each row execute function public.set_updated_at();
create trigger devices_set_updated_at before update on public.devices for each row execute function public.set_updated_at();
create trigger community_posts_set_updated_at before update on public.community_posts for each row execute function public.set_updated_at();
create trigger community_comments_set_updated_at before update on public.community_comments for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Showduino Creator')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.devices enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;

create policy "profiles_select_own" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create policy "projects_select_own" on public.projects for select to authenticated using (auth.uid() = user_id);
create policy "projects_insert_own" on public.projects for insert to authenticated with check (auth.uid() = user_id);
create policy "projects_update_own" on public.projects for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "projects_delete_own" on public.projects for delete to authenticated using (auth.uid() = user_id);

create policy "devices_select_own" on public.devices for select to authenticated using (auth.uid() = user_id);
create policy "devices_insert_own" on public.devices for insert to authenticated with check (auth.uid() = user_id);
create policy "devices_update_own" on public.devices for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "devices_delete_own" on public.devices for delete to authenticated using (auth.uid() = user_id);

create policy "community_posts_public_read" on public.community_posts for select to anon, authenticated using (true);
create policy "community_posts_insert_own" on public.community_posts for insert to authenticated with check (auth.uid() = author_id);
create policy "community_posts_update_own" on public.community_posts for update to authenticated using (auth.uid() = author_id) with check (auth.uid() = author_id);
create policy "community_posts_delete_own" on public.community_posts for delete to authenticated using (auth.uid() = author_id);

create policy "community_comments_public_read" on public.community_comments for select to anon, authenticated using (true);
create policy "community_comments_insert_own" on public.community_comments for insert to authenticated with check (auth.uid() = author_id);
create policy "community_comments_update_own" on public.community_comments for update to authenticated using (auth.uid() = author_id) with check (auth.uid() = author_id);
create policy "community_comments_delete_own" on public.community_comments for delete to authenticated using (auth.uid() = author_id);

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.devices to authenticated;
grant select on public.community_posts, public.community_comments to anon;
grant select, insert, update, delete on public.community_posts, public.community_comments to authenticated;
