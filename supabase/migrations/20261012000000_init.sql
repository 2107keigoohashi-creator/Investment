-- Maru Invest: 初期スキーマ
-- 全テーブルに user_id を持たせ、RLS で「自分の行だけ」読み書きできるようにする。
-- 価格・為替の自動取得（Vercel Cron）は service_role キーで RLS をバイパスして書き込む。

-- ---------------------------------------------------------------------------
-- 共通: updated_at 自動更新
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- user_settings: 基準通貨など
-- ---------------------------------------------------------------------------
create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  base_currency text not null default 'CAD' check (base_currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'America/Vancouver',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- accounts: 口座
-- ---------------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  institution text,
  -- tfsa / rrsp / fhsa は登録口座（譲渡益課税の対象外）、non_registered と exchange は課税口座
  account_type text not null check (account_type in ('tfsa', 'rrsp', 'fhsa', 'non_registered', 'exchange')),
  currency text not null default 'CAD' check (currency ~ '^[A-Z]{3}$'),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);
create index accounts_user_id_idx on public.accounts (user_id);

-- ---------------------------------------------------------------------------
-- assets: 銘柄
-- ---------------------------------------------------------------------------
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  symbol text not null,                 -- BTC, VFV.TO, AAPL ...
  name text not null,
  asset_type text not null check (asset_type in ('crypto', 'stock', 'etf', 'cash')),
  exchange text,                        -- TSX, NASDAQ, NYSE ...（暗号資産は null）
  currency text not null default 'CAD' check (currency ~ '^[A-Z]{3}$'),
  -- 価格の取得元（adapter 名）と、その取得元での ID（CoinGecko の 'bitcoin' など）
  price_source text not null default 'manual' check (price_source in ('coingecko', 'finnhub', 'alphavantage', 'manual')),
  source_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, symbol)
);
create index assets_user_id_idx on public.assets (user_id);

-- ---------------------------------------------------------------------------
-- transactions: 取引
-- ---------------------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete restrict,
  asset_id uuid references public.assets (id) on delete restrict,
  type text not null check (type in ('buy', 'sell', 'deposit', 'withdraw', 'dividend', 'fee', 'transfer')),
  trade_date date not null,
  quantity numeric(38, 18) not null default 0 check (quantity >= 0),
  price numeric(38, 18) not null default 0 check (price >= 0),   -- 取引通貨での単価
  fee numeric(38, 18) not null default 0 check (fee >= 0),       -- 取引通貨での手数料
  currency text not null default 'CAD' check (currency ~ '^[A-Z]{3}$'),
  fx_rate numeric(20, 10) not null default 1 check (fx_rate > 0), -- 1 currency = fx_rate CAD（取引日）
  amount numeric(38, 18) not null default 0,  -- 取引通貨での総額（買い=支払額 / 売り=受取額 / 入出金・配当=金額）
  amount_cad numeric(38, 18) not null default 0,
  fee_cad numeric(38, 18) not null default 0,
  transfer_account_id uuid references public.accounts (id) on delete restrict, -- transfer の移動先
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (type <> 'transfer' or transfer_account_id is not null),
  check (type not in ('buy', 'sell', 'transfer') or (asset_id is not null and quantity > 0))
);
create index transactions_user_date_idx on public.transactions (user_id, trade_date);
create index transactions_account_idx on public.transactions (account_id);
create index transactions_asset_idx on public.transactions (asset_id);
create index transactions_transfer_account_idx on public.transactions (transfer_account_id);

-- ---------------------------------------------------------------------------
-- prices: 日次の価格（1 資産 × 1 日 × 1 通貨 = 1 行）
-- ---------------------------------------------------------------------------
create table public.prices (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  asset_id uuid not null references public.assets (id) on delete cascade,
  date date not null,
  close numeric(38, 18) not null check (close >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  source text not null,
  fetched_at timestamptz not null default now(),
  unique (user_id, asset_id, date, currency)
);
create index prices_asset_date_idx on public.prices (asset_id, date desc);

-- ---------------------------------------------------------------------------
-- fx_rates: 日次の為替レート（1 base = rate quote）
-- ---------------------------------------------------------------------------
create table public.fx_rates (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  base text not null check (base ~ '^[A-Z]{3}$'),
  quote text not null check (quote ~ '^[A-Z]{3}$'),
  rate numeric(20, 10) not null check (rate > 0),
  source text not null,
  fetched_at timestamptz not null default now(),
  unique (user_id, date, base, quote)
);
create index fx_rates_user_pair_date_idx on public.fx_rates (user_id, base, quote, date desc);

-- ---------------------------------------------------------------------------
-- market_metrics: 恐怖強欲指数などの指標
-- ---------------------------------------------------------------------------
create table public.market_metrics (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  metric text not null,          -- 'fear_greed' など
  value numeric not null,
  label text,                    -- 'Greed' など
  source text not null,
  fetched_at timestamptz not null default now(),
  unique (user_id, date, metric)
);
create index market_metrics_user_metric_date_idx on public.market_metrics (user_id, metric, date desc);

-- ---------------------------------------------------------------------------
-- reports: 毎朝のレポート（Claude が Supabase MCP から INSERT する）
-- ---------------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  report_date date not null,
  target text not null default 'btc',   -- 'btc' / 'portfolio' / 銘柄ティッカー（'VFV.TO' など）
  headline text not null,
  stance text,
  summary text,                          -- Markdown 可
  dca_note text,
  events jsonb not null default '[]'::jsonb,   -- [{"date":"2026-10-14","title":"CPI","note":"..."}]
  sources jsonb not null default '[]'::jsonb,  -- [{"title":"...","url":"https://..."}]
  author text not null default 'claude',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, report_date, target),
  check (jsonb_typeof(events) = 'array'),
  check (jsonb_typeof(sources) = 'array')
);
create index reports_user_date_idx on public.reports (user_id, report_date desc);

-- ---------------------------------------------------------------------------
-- dca_plans: 積立ルール
-- ---------------------------------------------------------------------------
create table public.dca_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  asset_id uuid not null references public.assets (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  amount numeric(38, 18) not null check (amount > 0),
  currency text not null default 'CAD' check (currency ~ '^[A-Z]{3}$'),
  frequency text not null check (frequency in ('daily', 'weekly', 'biweekly', 'monthly')),
  day_of_week smallint check (day_of_week between 0 and 6),     -- 0=日曜（weekly / biweekly 用）
  day_of_month smallint check (day_of_month between 1 and 31),  -- monthly 用（月末を超える日は月末に寄せる）
  start_date date not null default current_date,
  is_active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index dca_plans_user_id_idx on public.dca_plans (user_id);
create index dca_plans_asset_idx on public.dca_plans (asset_id);
create index dca_plans_account_idx on public.dca_plans (account_id);

-- ---------------------------------------------------------------------------
-- updated_at トリガー
-- ---------------------------------------------------------------------------
create trigger set_updated_at before update on public.user_settings for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.accounts for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.assets for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.transactions for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.reports for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.dca_plans for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: 全テーブルで有効化し、自分の user_id の行だけ読み書き可能にする
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'user_settings', 'accounts', 'assets', 'transactions', 'prices',
    'fx_rates', 'market_metrics', 'reports', 'dca_plans'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated '
      'using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t
    );
  end loop;
end;
$$;
