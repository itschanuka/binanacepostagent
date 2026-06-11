create extension if not exists pgcrypto;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  image_url text,
  status text not null default 'pending',
  batch_id uuid not null,
  position integer not null,
  square_post_id text,
  square_post_url text,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint posts_status_check check (status in ('pending', 'posted')),
  constraint posts_position_check check (position > 0),
  constraint posts_batch_position_unique unique (batch_id, position)
);

create table if not exists public.settings (
  id integer primary key default 1,
  daily_limit integer not null default 100,
  active_batch_id uuid,
  cycle_count integer not null default 0,
  constraint settings_single_row_check check (id = 1),
  constraint settings_daily_limit_check check (daily_limit > 0),
  constraint settings_cycle_count_check check (cycle_count >= 0)
);

create table if not exists public.post_log (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  posted_at timestamptz not null default now()
);

create index if not exists posts_batch_id_idx on public.posts(batch_id);
create index if not exists posts_status_idx on public.posts(status);
create index if not exists post_log_posted_at_idx on public.post_log(posted_at);

alter table public.posts enable row level security;
alter table public.settings enable row level security;
alter table public.post_log enable row level security;

drop policy if exists "Authenticated users can read posts" on public.posts;
drop policy if exists "Authenticated users can insert posts" on public.posts;
drop policy if exists "Authenticated users can update posts" on public.posts;
drop policy if exists "Authenticated users can delete posts" on public.posts;

create policy "Authenticated users can read posts"
  on public.posts for select
  to authenticated
  using (true);

create policy "Authenticated users can insert posts"
  on public.posts for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update posts"
  on public.posts for update
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can delete posts"
  on public.posts for delete
  to authenticated
  using (true);

drop policy if exists "Authenticated users can read settings" on public.settings;
drop policy if exists "Authenticated users can insert settings" on public.settings;
drop policy if exists "Authenticated users can update settings" on public.settings;
drop policy if exists "Authenticated users can delete settings" on public.settings;

create policy "Authenticated users can read settings"
  on public.settings for select
  to authenticated
  using (true);

create policy "Authenticated users can insert settings"
  on public.settings for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update settings"
  on public.settings for update
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can delete settings"
  on public.settings for delete
  to authenticated
  using (true);

drop policy if exists "Authenticated users can read post_log" on public.post_log;
drop policy if exists "Authenticated users can insert post_log" on public.post_log;
drop policy if exists "Authenticated users can update post_log" on public.post_log;
drop policy if exists "Authenticated users can delete post_log" on public.post_log;

create policy "Authenticated users can read post_log"
  on public.post_log for select
  to authenticated
  using (true);

create policy "Authenticated users can insert post_log"
  on public.post_log for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update post_log"
  on public.post_log for update
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can delete post_log"
  on public.post_log for delete
  to authenticated
  using (true);

insert into public.settings (id, daily_limit, cycle_count)
values (1, 100, 0)
on conflict (id) do nothing;
