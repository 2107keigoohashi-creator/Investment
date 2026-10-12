-- マーケット（ウォッチリスト）・Yahoo Finance・ニュース

-- 価格の取得元に Yahoo Finance（キー不要）を追加
alter table public.assets drop constraint if exists assets_price_source_check;
alter table public.assets add constraint assets_price_source_check
  check (price_source in ('coingecko', 'yahoo', 'finnhub', 'alphavantage', 'manual'));

-- マーケット画面でのグループ分け
alter table public.assets add column if not exists category text not null default 'other'
  check (category in ('crypto', 'btc_etf', 'btc_stock', 'us_stock', 'ca_stock', 'index_etf', 'other'));

update public.assets set category = 'crypto' where asset_type = 'crypto' and category = 'other';

-- 既定のウォッチリスト（ビットコイン関連・米国株・カナダ株・指数 ETF）
create or replace function public.seed_watchlist(uid uuid)
returns void
language plpgsql
as $$
begin
  insert into public.assets (user_id, symbol, name, asset_type, exchange, currency, price_source, source_id, category)
  select uid, w.symbol, w.name, w.asset_type, w.exchange, w.currency, w.price_source, w.source_id, w.category
  from (values
    ('ETH',       'Ethereum',                         'crypto', null,     'CAD', 'coingecko', 'ethereum', 'crypto'),
    ('IBIT',      'iShares Bitcoin Trust',            'etf',    'NASDAQ', 'USD', 'yahoo', 'IBIT',      'btc_etf'),
    ('FBTC',      'Fidelity Wise Origin Bitcoin',     'etf',    'CBOE',   'USD', 'yahoo', 'FBTC',      'btc_etf'),
    ('ARKB',      'ARK 21Shares Bitcoin ETF',         'etf',    'CBOE',   'USD', 'yahoo', 'ARKB',      'btc_etf'),
    ('BITB',      'Bitwise Bitcoin ETF',              'etf',    'NYSE',   'USD', 'yahoo', 'BITB',      'btc_etf'),
    ('GBTC',      'Grayscale Bitcoin Trust',          'etf',    'NYSE',   'USD', 'yahoo', 'GBTC',      'btc_etf'),
    ('BTCC-B.TO', 'Purpose Bitcoin ETF',              'etf',    'TSX',    'CAD', 'yahoo', 'BTCC-B.TO', 'btc_etf'),
    ('FBTC.TO',   'Fidelity Advantage Bitcoin ETF',   'etf',    'TSX',    'CAD', 'yahoo', 'FBTC.TO',   'btc_etf'),
    ('BTCX-B.TO', 'CI Galaxy Bitcoin ETF',            'etf',    'TSX',    'CAD', 'yahoo', 'BTCX-B.TO', 'btc_etf'),
    ('EBIT.TO',   'Evolve Bitcoin ETF',               'etf',    'TSX',    'CAD', 'yahoo', 'EBIT.TO',   'btc_etf'),
    ('MSTR',      'Strategy',                         'stock',  'NASDAQ', 'USD', 'yahoo', 'MSTR',      'btc_stock'),
    ('COIN',      'Coinbase',                         'stock',  'NASDAQ', 'USD', 'yahoo', 'COIN',      'btc_stock'),
    ('MARA',      'MARA Holdings',                    'stock',  'NASDAQ', 'USD', 'yahoo', 'MARA',      'btc_stock'),
    ('RIOT',      'Riot Platforms',                   'stock',  'NASDAQ', 'USD', 'yahoo', 'RIOT',      'btc_stock'),
    ('CLSK',      'CleanSpark',                       'stock',  'NASDAQ', 'USD', 'yahoo', 'CLSK',      'btc_stock'),
    ('HUT',       'Hut 8',                            'stock',  'NASDAQ', 'USD', 'yahoo', 'HUT',       'btc_stock'),
    ('BITF.TO',   'Bitfarms',                         'stock',  'TSX',    'CAD', 'yahoo', 'BITF.TO',   'btc_stock'),
    ('AAPL',      'Apple',                            'stock',  'NASDAQ', 'USD', 'yahoo', 'AAPL',      'us_stock'),
    ('MSFT',      'Microsoft',                        'stock',  'NASDAQ', 'USD', 'yahoo', 'MSFT',      'us_stock'),
    ('NVDA',      'NVIDIA',                           'stock',  'NASDAQ', 'USD', 'yahoo', 'NVDA',      'us_stock'),
    ('GOOGL',     'Alphabet',                         'stock',  'NASDAQ', 'USD', 'yahoo', 'GOOGL',     'us_stock'),
    ('AMZN',      'Amazon',                           'stock',  'NASDAQ', 'USD', 'yahoo', 'AMZN',      'us_stock'),
    ('META',      'Meta Platforms',                   'stock',  'NASDAQ', 'USD', 'yahoo', 'META',      'us_stock'),
    ('TSLA',      'Tesla',                            'stock',  'NASDAQ', 'USD', 'yahoo', 'TSLA',      'us_stock'),
    ('RY.TO',     'Royal Bank of Canada',             'stock',  'TSX',    'CAD', 'yahoo', 'RY.TO',     'ca_stock'),
    ('TD.TO',     'Toronto-Dominion Bank',            'stock',  'TSX',    'CAD', 'yahoo', 'TD.TO',     'ca_stock'),
    ('SHOP.TO',   'Shopify',                          'stock',  'TSX',    'CAD', 'yahoo', 'SHOP.TO',   'ca_stock'),
    ('ENB.TO',    'Enbridge',                         'stock',  'TSX',    'CAD', 'yahoo', 'ENB.TO',    'ca_stock'),
    ('CNR.TO',    'Canadian National Railway',        'stock',  'TSX',    'CAD', 'yahoo', 'CNR.TO',    'ca_stock'),
    ('BN.TO',     'Brookfield Corporation',           'stock',  'TSX',    'CAD', 'yahoo', 'BN.TO',     'ca_stock'),
    ('VFV.TO',    'Vanguard S&P 500 Index ETF',       'etf',    'TSX',    'CAD', 'yahoo', 'VFV.TO',    'index_etf'),
    ('XEQT.TO',   'iShares Core Equity ETF Portfolio','etf',    'TSX',    'CAD', 'yahoo', 'XEQT.TO',   'index_etf'),
    ('XIU.TO',    'iShares S&P/TSX 60 Index ETF',     'etf',    'TSX',    'CAD', 'yahoo', 'XIU.TO',    'index_etf'),
    ('SPY',       'SPDR S&P 500 ETF',                 'etf',    'NYSE',   'USD', 'yahoo', 'SPY',       'index_etf'),
    ('QQQ',       'Invesco QQQ Trust',                'etf',    'NASDAQ', 'USD', 'yahoo', 'QQQ',       'index_etf')
  ) as w(symbol, name, asset_type, exchange, currency, price_source, source_id, category)
  on conflict (user_id, symbol) do nothing;
end;
$$;

revoke execute on function public.seed_watchlist(uuid) from public;

-- 新規ユーザーにも入れる
create or replace function public.handle_new_user()
returns trigger
language plpgsql
as $$
begin
  perform public.bootstrap_user(new.id);
  perform public.seed_watchlist(new.id);
  return new;
end;
$$;

-- 既存ユーザーに入れる
do $$
declare
  u record;
begin
  for u in select id from public.app_users loop
    perform public.seed_watchlist(u.id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- news: ニュース（全ユーザー共通。1 日 3 回 Google ニュースの RSS から取得）
-- ---------------------------------------------------------------------------
create table if not exists public.news (
  id bigint generated always as identity primary key,
  category text not null,          -- 'btc' / 'us' / 'canada' / 'macro'
  title text not null,
  url text not null unique,
  source text,
  published_at timestamptz,
  fetched_at timestamptz not null default now()
);
create index if not exists news_category_published_idx on public.news (category, published_at desc);
create index if not exists news_published_idx on public.news (published_at desc);

-- 取得の記録（「最終更新」の表示と、更新しすぎ防止に使う）
create table if not exists public.news_fetches (
  id bigint generated always as identity primary key,
  fetched_at timestamptz not null default now(),
  items integer not null default 0,
  ok boolean not null default true,
  error text
);

-- ニュースは全員が読めるが、書けるのは所有者ロール（Cron）だけ
alter table public.news enable row level security;
create policy read_all on public.news for select to maru_app using (true);
grant select on public.news to maru_app;

alter table public.news_fetches enable row level security;
create policy read_all on public.news_fetches for select to maru_app using (true);
grant select on public.news_fetches to maru_app;
