# Maru Invest

自分専用の投資管理アプリ（カナダ・バンクーバー在住、基準通貨 CAD、日本語 UI、スマホ優先の PWA）。

- Next.js 16（App Router）+ TypeScript + Tailwind CSS v4
- Neon（Postgres、無料枠）+ RLS
- ログイン: メール＋パスワード（pgcrypto の bcrypt で照合、署名付き Cookie セッション）
- Vercel（ホスティング + Cron）
- 価格: CoinGecko（暗号資産）、Finnhub / Alpha Vantage（株・ETF、adapter で差し替え可）
- 為替: Bank of Canada Valet API（USD/CAD）
- 恐怖強欲指数: alternative.me

> 売買を推奨する機能はありません。記録の管理と、Claude が書くレポートの表示に集中しています。

---

## 画面

| 画面 | パス | 内容 |
|---|---|---|
| ホーム | `/` | 総資産（CAD）、前日比、含み損益、確定損益、今朝のレポート、価格（◯日前の値の表示つき）、恐怖強欲指数、資産配分、資産ごと・口座ごとの含み損益 |
| 資産の詳細 | `/assets/BTC` | 価格チャート（1週間 / 1か月 / 1年 / 全期間）＋平均取得単価のライン、保有状況、取引履歴、その資産のレポート、価格の手入力 |
| 取引の記録 | `/transactions/new` | 「金額 → 数量 → 記録」の 3 タップ。数量＋支払額から単価を自動計算 |
| 取引履歴 | `/transactions` | すべての取引（タップで詳細・削除） |
| 積立 | `/dca` | 積立ルール、次に買う予定日、過去 1 年の「積立 vs 一括」比較 |
| レポート | `/reports`, `/reports/[id]` | 毎朝のレポートの一覧と詳細 |
| 設定 | `/settings` | 口座・銘柄の管理、価格の手動取得 / 過去データ取り込み、基準通貨、API キーの設定状況 |

## 計算（`src/lib/calc/`、ユニットテストあり）

- **ACB（平均法）**: 買いは `数量×単価+手数料` を ACB に加算。売りは `ACB × 売却数量/保有数量` を原価として確定損益を出す（`acb.ts`）
- **課税口座のプール**: 課税口座（課税口座・取引所）の同じ銘柄は、口座をまたいで 1 つの ACB で計算（カナダの identical properties ルール）
- **TFSA / RRSP / FHSA**: 売却損益は出すが、譲渡益（taxable）からは外す
- **口座間の移動**: 同じ種類の口座間は ACB をそのまま移す。課税口座 ↔ 登録口座の移動は時価での処分（みなし譲渡）として扱う
- **FX**: USD 建ての取引は、取引日の FX レート（記録時に入力 / 既定は Bank of Canada の最新値）で CAD に換算して保存
- **含み損益**: 資産ごと・口座ごと・全体（`portfolio.ts`）
- **年ごとの譲渡益**、**30日ルール（superficial loss）の検出**（`tax.ts`）、**積立日・積立 vs 一括**（`dca.ts`）

```bash
npm test          # vitest
```

---

## セットアップ

### 1. Vercel と Neon

1. Vercel → **Add New → Project** → この GitHub リポジトリを Import（Framework: Next.js）
2. プロジェクトの **Storage → Create Database → Neon**（Free）→ Connect
   - `DATABASE_URL`（pooled）と `DATABASE_URL_UNPOOLED` などが自動で環境変数に入る
3. **Settings → Environment Variables** に追加（Production / Preview / Development）
   - `SESSION_SECRET`: 32 文字以上のランダム文字列（`openssl rand -hex 32`）
   - `CRON_SECRET`: 同じくランダム文字列
4. **Redeploy**。ビルドの最初に `scripts/migrate.mjs` が `db/migrations/*.sql` を流す（流したものは `schema_migrations` に記録され、2 回目以降はスキップ）

### 2. 自分のユーザーを作る

Neon の **SQL Editor**（Vercel の Storage 画面の「Open in Neon」から開ける）で 1 回だけ実行:

```sql
insert into app_users (email, password_hash)
values ('you@example.com', crypt('ここに長いパスワード', gen_salt('bf', 10)));
```

- ユーザーが作られると、トリガーで初期データ（BTC、口座「Kraken」、初期価格、2026-10-12 のレポート）が入る
- パスワードを変えるとき: `update app_users set password_hash = crypt('新しいパスワード', gen_salt('bf', 10)) where email = 'you@example.com';`
- ローカルからなら `npm run user:create -- you@example.com 'パスワード'` でも同じ

### 3. 初回の過去データ取り込み

アプリにログイン → 設定 →「過去の価格を取り込む」（チャート用に 1 年分）。
または `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/backfill?days=365`

### 4. スマホのホーム画面に追加

- iPhone: Safari で開く → 共有 → 「ホーム画面に追加」
- Android: Chrome で開く → メニュー → 「アプリをインストール」

### 環境変数

| 変数 | 必須 | 内容 |
|---|---|---|
| `DATABASE_URL` | ✓ | Neon の接続文字列（pooled）。Neon 連携で自動設定 |
| `DATABASE_URL_UNPOOLED` | | マイグレーション用の直接接続。Neon 連携で自動設定 |
| `SESSION_SECRET` | ✓ | ログイン Cookie の署名キー（32 文字以上） |
| `CRON_SECRET` | ✓ | Cron の認証用（Vercel Cron が `Authorization: Bearer` で送る） |
| `COINGECKO_API_KEY` | | CoinGecko Demo API キー（なくても動く） |
| `STOCK_PRICE_PROVIDER` | | `finnhub`（既定）か `alphavantage` |
| `FINNHUB_API_KEY` | | 株・ETF を追加したら必要 |
| `ALPHAVANTAGE_API_KEY` | | Alpha Vantage を使う場合 |

### ローカルで動かす

```bash
cp .env.example .env.local   # DATABASE_URL などを入れる
npm install
npm run db:migrate
npm run user:create -- you@example.com 'パスワード'
npm run dev                  # http://localhost:3000
```

---

## データの自動取得（Vercel Cron）

`/api/cron/daily` を毎朝 **6:30 America/Vancouver** に実行します。

- Vercel Cron は UTC 指定なので、夏時間用 `30 13 * * *` と冬時間用 `30 14 * * *` の 2 本を登録し、バンクーバー時間で 6 時台の方だけが処理します（もう一方はスキップ）
- Hobby プランの Cron は「指定した時の中のどこか」で動くため、実際は 6:00〜6:59 のどこかになります
- 手動実行: `curl -H "Authorization: Bearer $CRON_SECRET" "https://<domain>/api/cron/daily?force=1"`

取得するもの:

| 対象 | 取得元 | 保存先 |
|---|---|---|
| 暗号資産（CAD と USD） | CoinGecko `/simple/price` | `prices` |
| 株・ETF | Finnhub `/quote` または Alpha Vantage `GLOBAL_QUOTE` | `prices` |
| USD/CAD | Bank of Canada Valet `FXUSDCAD` | `fx_rates` |
| 恐怖強欲指数 | alternative.me `/fng` | `market_metrics` |

各ステップは独立していて、1 つが失敗しても他は続きます。失敗した日は前回の値が残り、画面には「◯日前の値」と表示されます。

### 価格の取得元を差し替える（adapter）

`src/lib/market/types.ts` の `PriceProvider` を実装して `src/lib/market/registry.ts` に登録し、`assets.price_source` にその名前を入れます（DB の check 制約にも追加）。銘柄ごとに `assets.source_id` で取得元側の ID（CoinGecko の `bitcoin`、Alpha Vantage の `VFV.TRT` など）を指定できます。

---

## データ設計

マイグレーション: `db/migrations/`（ビルド時に自動適用）

| テーブル | 内容 |
|---|---|
| `app_users` | ログインユーザー（メール、bcrypt ハッシュ） |
| `user_settings` | 基準通貨（CAD）、タイムゾーン |
| `accounts` | 口座。`account_type`: `tfsa` / `rrsp` / `fhsa` / `non_registered`（課税口座）/ `exchange`（取引所）、`currency` |
| `assets` | 銘柄。`asset_type`: `crypto` / `stock` / `etf` / `cash`、`symbol`、`exchange`、`currency`、`price_source`、`source_id` |
| `transactions` | 取引。`type`: `buy` / `sell` / `deposit` / `withdraw` / `dividend` / `fee` / `transfer`、`quantity`、`price`、`fee`、`currency`、`fx_rate`（1 通貨 = ? CAD）、`amount`、`amount_cad`、`fee_cad`、`transfer_account_id`、`note` |
| `prices` | 日次価格（`asset_id`, `date`, `close`, `currency`, `source`）。1 資産 × 1 日 × 1 通貨 = 1 行 |
| `fx_rates` | 日次為替（`date`, `base`, `quote`, `rate`, `source`） |
| `market_metrics` | 恐怖強欲指数など（`date`, `metric`, `value`, `label`） |
| `reports` | 毎朝のレポート |
| `dca_plans` | 積立ルール（`asset_id`, `account_id`, `amount`, `frequency`, `day_of_week`, `day_of_month`, `start_date`, `is_active`） |

### RLS（行レベルセキュリティ）

全テーブルで RLS を有効にし、自分の `user_id` の行だけ読み書きできるようにしています。

- アプリはリクエストごとにトランザクションを張り、`set_config('app.user_id', <ログイン中のユーザー>, true)` と `set local role maru_app` を実行してからクエリを流す（`src/lib/db.ts` の `withUser`）
- `maru_app` はログインできないロールで、ポリシー `user_id = current_app_user()` が必ずかかる。`app_users` のパスワードハッシュは読めない
- Cron・マイグレーション・Claude（Neon MCP）は所有者ロールで接続するので RLS をバイパスする

---

## Claude にレポートを書かせるときの手順書

毎朝のレポートは Claude（予定タスク）が **Neon MCP の `run_sql`**（Neon の公式 MCP サーバー `https://mcp.neon.tech/mcp` を Claude のコネクタに追加）で `public.reports` に直接 INSERT します。アプリは表示するだけです。

- Neon のプロジェクトは Vercel 連携で作ったもの（Neon コンソールで名前を確認）。データベース名は通常 `neondb`
- 所有者ロールで実行されるので RLS はかからない。`user_id` は必ず自分の ID を入れる

### テーブル: `public.reports`

| カラム | 型 | 必須 | 内容 |
|---|---|---|---|
| `user_id` | uuid | ✓ | 自分のユーザー ID（下の例のように `app_users` のメールから引く） |
| `report_date` | date | ✓ | レポートの日付（バンクーバー時間の今日。例 `'2026-10-13'`） |
| `target` | text | ✓ | `'btc'` / `'portfolio'` / 銘柄ティッカー（`'VFV.TO'` など。`assets.symbol` と同じ表記にすると資産の詳細画面にも出る） |
| `headline` | text | ✓ | 1 行の見出し（ホームに出る） |
| `stance` | text | | 例: `'様子見〜少額積立OK'` |
| `summary` | text | | 本文。Markdown の見出し（`#`）・箇条書き（`-`）・太字（`**`）・リンクが使える |
| `dca_note` | text | | 積立についてのメモ |
| `events` | jsonb（配列） | | `[{"date":"2026-10-14","title":"CPI","note":"任意"}]` |
| `sources` | jsonb（配列） | | `[{"title":"記事名","url":"https://..."}]` |
| `author` | text | | 既定 `'claude'` |

- `(user_id, report_date, target)` は一意。同じ日・同じ対象を書き直すときは下の `on conflict ... do update` を使う
- `id`、`created_at`、`updated_at` は自動で入る
- **売買の推奨は書かない**（判断材料の整理に留める）

### INSERT の例

```sql
insert into public.reports
  (user_id, report_date, target, headline, stance, summary, dca_note, events, sources)
values (
  (select id from app_users where email = 'you@example.com'),
  '2026-10-13',
  'btc',
  'CPI前に$85K台で小動き。ETFフローは3日連続の流入',
  '様子見〜少額積立OK',
  $md$
- BTC は前日比 +1.2%（CAD 建て 約 $121K）
- 恐怖強欲指数 71（Greed）
- **焦点**: 水曜の CPI、木曜の Warsh 議長講演
$md$,
  'いつもどおり週次の少額積立。CPI 前後の値動きに注意',
  '[{"date":"2026-10-14","title":"CPI"},{"date":"2026-10-15","title":"Warsh議長講演"}]'::jsonb,
  '[{"title":"Bank of Canada","url":"https://www.bankofcanada.ca/"}]'::jsonb
)
on conflict (user_id, report_date, target) do update set
  headline = excluded.headline,
  stance   = excluded.stance,
  summary  = excluded.summary,
  dca_note = excluded.dca_note,
  events   = excluded.events,
  sources  = excluded.sources;
```

### レポートを書く前に読むとよいデータ（参考 SELECT）

```sql
-- 直近の BTC 価格（CAD / USD）
select date, currency, close, source from public.prices p
join public.assets a on a.id = p.asset_id
where a.symbol = 'BTC' order by date desc, currency limit 10;

-- 恐怖強欲指数・為替
select date, value, label from public.market_metrics where metric = 'fear_greed' order by date desc limit 7;
select date, rate from public.fx_rates where base = 'USD' and quote = 'CAD' order by date desc limit 5;

-- 前回のレポート
select report_date, target, headline, stance from public.reports order by report_date desc limit 5;
```

### 予定タスクのプロンプト例

> 毎朝 6:45（バンクーバー時間）に実行。Neon MCP で Maru Invest のデータベース（neondb）に接続し、README の「Claude にレポートを書かせるときの手順書」に従って、今日の `target='btc'` のレポートを `public.reports` に INSERT して。価格と恐怖強欲指数は `prices` / `market_metrics` の最新値を使い、ニュースは出典 URL を `sources` に入れる。売買の推奨は書かない。

---

## 開発メモ

```bash
npm run dev        # 開発サーバー
npm test           # ユニットテスト（計算ロジック・adapter）
TEST_DATABASE_URL=postgres://... npm test   # DB を使う結合テストも動かす
npm run typecheck  # 型チェック
npm run lint       # ESLint
npm run build      # 本番ビルド
```

## ロードマップ

- **Phase 1**: データ設計、認証、BTC の記録とホーム、価格の自動取得、レポートの表示、デプロイ
- **Phase 2**: 株式・ETF（取得元の設定）、複数口座の運用、課税口座の年別譲渡益画面、積立の比較の拡充、30 日ルールの警告表示
