alter table public.posts
  add column if not exists scheduled_for timestamptz;

alter table public.settings
  add column if not exists post_interval_minutes integer not null default 10;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'settings_post_interval_minutes_check'
  ) then
    alter table public.settings
      add constraint settings_post_interval_minutes_check
      check (post_interval_minutes > 0);
  end if;
end $$;

create index if not exists posts_scheduled_for_idx on public.posts(scheduled_for);
