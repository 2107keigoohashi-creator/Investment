// 環境変数の読み出し（キーはコードに書かず、すべて環境変数から読む）

export function supabaseUrl(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!v) throw new Error("NEXT_PUBLIC_SUPABASE_URL が設定されていません");
  return v;
}

/** ブラウザに出してよい公開キー（publishable key / 旧 anon key） */
export function supabasePublicKey(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!v) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY が設定されていません");
  return v;
}

/** サーバー専用の秘密キー（Cron が RLS をバイパスして書き込むときだけ使う） */
export function supabaseSecretKey(): string {
  const v = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!v) throw new Error("SUPABASE_SECRET_KEY（または SUPABASE_SERVICE_ROLE_KEY）が設定されていません");
  return v;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}

/** ログインを許可するメールアドレス（カンマ区切り）。未設定なら Supabase 側の設定に任せる */
export function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** 設定画面で「設定済みか」だけを表示するための一覧（値は出さない） */
export const ENV_KEYS = [
  { key: "NEXT_PUBLIC_SUPABASE_URL", label: "Supabase URL", required: true },
  { key: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", alt: "NEXT_PUBLIC_SUPABASE_ANON_KEY", label: "Supabase 公開キー", required: true },
  { key: "SUPABASE_SECRET_KEY", alt: "SUPABASE_SERVICE_ROLE_KEY", label: "Supabase 秘密キー（Cron 用）", required: true },
  { key: "CRON_SECRET", label: "Cron の認証用シークレット", required: true },
  { key: "ALLOWED_EMAILS", label: "ログインを許可するメール", required: false },
  { key: "COINGECKO_API_KEY", label: "CoinGecko Demo API キー", required: false },
  { key: "STOCK_PRICE_PROVIDER", label: "株価の取得元（finnhub / alphavantage）", required: false },
  { key: "FINNHUB_API_KEY", label: "Finnhub API キー", required: false },
  { key: "ALPHAVANTAGE_API_KEY", label: "Alpha Vantage API キー", required: false },
] as const;
