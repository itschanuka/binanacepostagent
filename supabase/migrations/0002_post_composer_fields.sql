alter table public.posts
  add column if not exists content_style text not null default 'market_update',
  add column if not exists coin_symbol text,
  add column if not exists chart_symbol text,
  add column if not exists chart_interval text,
  add constraint posts_content_style_check
    check (content_style in ('market_update', 'news', 'analysis', 'education', 'question'));

create index if not exists posts_coin_symbol_idx on public.posts(coin_symbol);
