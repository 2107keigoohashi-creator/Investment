-- ニュースに言語（日本語 / 海外の英語）を持たせる
alter table public.news add column if not exists lang text not null default 'ja' check (lang in ('ja', 'en'));
update public.news set lang = 'en' where category = 'canada';
create index if not exists news_lang_published_idx on public.news (lang, published_at desc);

-- Bitfarms は Yahoo で BITF.TO の価格が取れないため、NASDAQ の BITF に切り替える（取引がない場合だけ）
update public.assets a
set symbol = 'BITF', source_id = 'BITF', exchange = 'NASDAQ', currency = 'USD'
where a.symbol = 'BITF.TO'
  and not exists (select 1 from public.transactions t where t.asset_id = a.id)
  and not exists (select 1 from public.assets b where b.user_id = a.user_id and b.symbol = 'BITF');

-- 今後の新規ユーザー向けのウォッチリストも直す
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
    ('BITF',      'Bitfarms',                         'stock',  'NASDAQ', 'USD', 'yahoo', 'BITF',      'btc_stock'),
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
