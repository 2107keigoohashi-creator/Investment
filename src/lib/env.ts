// 環境変数の読み出し（キーはコードに書かず、すべて環境変数から読む）

export function databaseUrl(): string {
  const v = process.env.DATABASE_URL;
  if (!v) throw new Error("DATABASE_URL が設定されていません");
  return v;
}



/** 設定画面で「設定済みか」だけを表示するための一覧（値は出さない） */
export const ENV_KEYS = [
  { key: "DATABASE_URL", label: "Neon の接続文字列（pooled）", required: true },
  { key: "SESSION_SECRET", label: "ログインセッションの署名キー（32 文字以上）", required: true },
  { key: "CRON_SECRET", label: "Cron の認証用シークレット", required: true },
  { key: "COINGECKO_API_KEY", label: "CoinGecko Demo API キー", required: false },
  { key: "STOCK_PRICE_PROVIDER", label: "株価の取得元（finnhub / alphavantage）", required: false },
  { key: "FINNHUB_API_KEY", label: "Finnhub API キー", required: false },
  { key: "ALPHAVANTAGE_API_KEY", label: "Alpha Vantage API キー", required: false },
] as const;
