// DB の行に対応する型（db/migrations のテーブル定義と揃える）

export type AccountType = "tfsa" | "rrsp" | "fhsa" | "non_registered" | "exchange";
export type AssetType = "crypto" | "stock" | "etf" | "cash";
export type PriceSource = "coingecko" | "finnhub" | "alphavantage" | "manual";
export type TransactionType = "buy" | "sell" | "deposit" | "withdraw" | "dividend" | "fee" | "transfer";
export type DcaFrequency = "daily" | "weekly" | "biweekly" | "monthly";

export interface Account {
  id: string;
  user_id: string;
  name: string;
  institution: string | null;
  account_type: AccountType;
  currency: string;
  is_active: boolean;
  sort_order: number;
}

export interface Asset {
  id: string;
  user_id: string;
  symbol: string;
  name: string;
  asset_type: AssetType;
  exchange: string | null;
  currency: string;
  price_source: PriceSource;
  source_id: string | null;
  is_active: boolean;
}

export interface Transaction {
  id: string;
  user_id: string;
  account_id: string;
  asset_id: string | null;
  type: TransactionType;
  trade_date: string; // YYYY-MM-DD
  quantity: number;
  price: number;
  fee: number;
  currency: string;
  fx_rate: number;
  amount: number;
  amount_cad: number;
  fee_cad: number;
  transfer_account_id: string | null;
  note: string | null;
  created_at: string;
}

export interface PriceRow {
  asset_id: string;
  date: string;
  close: number;
  currency: string;
  source: string;
}

export interface FxRateRow {
  date: string;
  base: string;
  quote: string;
  rate: number;
  source: string;
}

export interface MarketMetric {
  date: string;
  metric: string;
  value: number;
  label: string | null;
  source: string;
}

export interface ReportEvent {
  date?: string;
  title: string;
  note?: string;
}

export interface ReportSource {
  title?: string;
  url: string;
}

export interface Report {
  id: string;
  report_date: string;
  target: string;
  headline: string;
  stance: string | null;
  summary: string | null;
  dca_note: string | null;
  events: ReportEvent[];
  sources: ReportSource[];
  author: string;
  created_at: string;
}

export interface DcaPlan {
  id: string;
  asset_id: string;
  account_id: string;
  amount: number;
  currency: string;
  frequency: DcaFrequency;
  day_of_week: number | null;
  day_of_month: number | null;
  start_date: string;
  is_active: boolean;
  note: string | null;
}

export const REGISTERED_ACCOUNT_TYPES: readonly AccountType[] = ["tfsa", "rrsp", "fhsa"];

export function isTaxableAccount(type: AccountType): boolean {
  return !REGISTERED_ACCOUNT_TYPES.includes(type);
}
