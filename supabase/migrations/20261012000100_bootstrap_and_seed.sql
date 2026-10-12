-- ユーザー作成時に初期データ（BTC・口座・初期価格・初期レポート）を入れる。
-- 何度呼んでも重複しない（冪等）。

create or replace function public.bootstrap_user(uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  btc_id uuid;
begin
  insert into public.user_settings (user_id) values (uid)
  on conflict (user_id) do nothing;

  insert into public.accounts (user_id, name, institution, account_type, currency, sort_order)
  values (uid, 'Kraken', 'Kraken', 'exchange', 'CAD', 0)
  on conflict (user_id, name) do nothing;

  insert into public.assets (user_id, symbol, name, asset_type, exchange, currency, price_source, source_id)
  values (uid, 'BTC', 'Bitcoin', 'crypto', null, 'CAD', 'coingecko', 'bitcoin')
  on conflict (user_id, symbol) do nothing;

  select id into btc_id from public.assets where user_id = uid and symbol = 'BTC';

  insert into public.prices (user_id, asset_id, date, close, currency, source) values
    (uid, btc_id, '2026-10-09', 82966,  'USD', 'seed'),
    (uid, btc_id, '2026-10-09', 118202, 'CAD', 'seed'),
    (uid, btc_id, '2026-10-12', 83854,  'USD', 'seed'),
    (uid, btc_id, '2026-10-12', 119467, 'CAD', 'seed')
  on conflict (user_id, asset_id, date, currency) do nothing;

  insert into public.market_metrics (user_id, date, metric, value, label, source)
  values (uid, '2026-10-12', 'fear_greed', 69, 'Greed', 'seed')
  on conflict (user_id, date, metric) do nothing;

  insert into public.reports (user_id, report_date, target, headline, stance, events, sources, author)
  values (
    uid, '2026-10-12', 'btc',
    '4日続落から反発、約$84K。今週はCPI(水)とWarsh議長講演(木)が焦点',
    '様子見〜少額積立OK',
    '[{"date":"2026-10-14","title":"CPI"},{"date":"2026-10-15","title":"Warsh議長講演"}]'::jsonb,
    '[]'::jsonb,
    'seed'
  )
  on conflict (user_id, report_date, target) do nothing;
end;
$$;

revoke execute on function public.bootstrap_user(uuid) from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.bootstrap_user(new.id);
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- マイグレーション実行時点で既にユーザーがいれば、その人にも入れる
do $$
declare
  u record;
begin
  for u in select id from auth.users loop
    perform public.bootstrap_user(u.id);
  end loop;
end;
$$;
