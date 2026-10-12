import "server-only";
import { requireUser } from "./auth";
import { computeLedger, type Ledger } from "./calc/acb";
import { addDays, todayIn } from "./calc/dates";
import { latestCadQuote, valuePortfolio, type CadQuote, type FxPoint, type PricePoint, type Valuation } from "./calc/portfolio";
import { withUser, type Tx } from "./db";
import type { Account, Asset, DcaPlan, MarketMetric, PriceRow, Report, Transaction } from "./types";

export const TZ = "America/Vancouver";

/** ログイン中のユーザーとして（RLS 付きで）DB を読む */
export async function asUser<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const user = await requireUser();
  return withUser(user.userId, fn);
}

export async function loadAccounts(tx: Tx): Promise<Account[]> {
  return tx<Account[]>`select * from accounts order by sort_order, created_at`;
}

export async function loadAssets(tx: Tx): Promise<Asset[]> {
  return tx<Asset[]>`select * from assets order by created_at`;
}

export async function loadAssetBySymbol(tx: Tx, symbol: string): Promise<Asset | null> {
  const rows = await tx<Asset[]>`select * from assets where symbol = ${symbol}`;
  return rows[0] ?? null;
}

export async function loadTransactions(tx: Tx, assetId?: string): Promise<Transaction[]> {
  return assetId
    ? tx<Transaction[]>`select * from transactions where asset_id = ${assetId} order by trade_date, created_at`
    : tx<Transaction[]>`select * from transactions order by trade_date, created_at`;
}

export async function loadLastTransaction(tx: Tx): Promise<Pick<Transaction, "account_id" | "asset_id"> | null> {
  const rows = await tx<Pick<Transaction, "account_id" | "asset_id">[]>`
    select account_id, asset_id from transactions order by created_at desc limit 1`;
  return rows[0] ?? null;
}

export async function loadPrices(tx: Tx, opts: { assetId?: string; since?: string } = {}): Promise<PriceRow[]> {
  const since = opts.since ?? "0001-01-01";
  return opts.assetId
    ? tx<PriceRow[]>`select asset_id, date, close, currency, source from prices
        where asset_id = ${opts.assetId} and date >= ${since} order by date`
    : tx<PriceRow[]>`select asset_id, date, close, currency, source from prices
        where date >= ${since} order by date`;
}

/** 通貨ごとの「1 通貨 = rate CAD」の系列 */
export async function loadFx(tx: Tx, since = "0001-01-01"): Promise<Record<string, FxPoint[]>> {
  const rows = await tx<{ date: string; base: string; rate: number }[]>`
    select date, base, rate from fx_rates where quote = 'CAD' and date >= ${since} order by date`;
  const out: Record<string, FxPoint[]> = {};
  for (const r of rows) (out[r.base] ??= []).push({ date: r.date, rate: r.rate });
  return out;
}

export async function latestFx(tx: Tx, base = "USD"): Promise<FxPoint | null> {
  const rows = await tx<FxPoint[]>`
    select date, rate from fx_rates where base = ${base} and quote = 'CAD' order by date desc limit 1`;
  return rows[0] ?? null;
}

export async function latestMetric(tx: Tx, metric: string): Promise<MarketMetric | null> {
  const rows = await tx<MarketMetric[]>`
    select date, metric, value, label, source from market_metrics
    where metric = ${metric} order by date desc limit 1`;
  return rows[0] ?? null;
}

function normalizeReport(r: Report): Report {
  return {
    ...r,
    events: Array.isArray(r.events) ? r.events : [],
    sources: Array.isArray(r.sources) ? r.sources : [],
  };
}

export async function loadReports(tx: Tx, opts: { target?: string; limit?: number } = {}): Promise<Report[]> {
  const limit = opts.limit ?? 100;
  const rows = opts.target
    ? await tx<Report[]>`select * from reports where lower(target) = lower(${opts.target})
        order by report_date desc, created_at desc limit ${limit}`
    : await tx<Report[]>`select * from reports order by report_date desc, created_at desc limit ${limit}`;
  return rows.map(normalizeReport);
}

export async function loadReport(tx: Tx, id: string): Promise<Report | null> {
  const rows = await tx<Report[]>`select * from reports where id = ${id}`;
  return rows[0] ? normalizeReport(rows[0]) : null;
}

export async function loadDcaPlans(tx: Tx): Promise<DcaPlan[]> {
  return tx<DcaPlan[]>`select * from dca_plans order by created_at`;
}

export async function loadBaseCurrency(tx: Tx): Promise<string> {
  const rows = await tx<{ base_currency: string }[]>`select base_currency from user_settings`;
  return rows[0]?.base_currency ?? "CAD";
}

export function quotesFor(assets: Asset[], prices: PriceRow[], fx: Record<string, FxPoint[]>) {
  const byAsset = new Map<string, PricePoint[]>();
  for (const p of prices) {
    const arr = byAsset.get(p.asset_id) ?? [];
    arr.push(p);
    byAsset.set(p.asset_id, arr);
  }
  const quotes: Record<string, CadQuote | null> = {};
  for (const a of assets) {
    if (a.asset_type === "cash") {
      // 現金は 1 単位 = 1 通貨。CAD 以外は最新の FX で換算
      const rate = a.currency === "CAD" ? 1 : (fx[a.currency]?.at(-1)?.rate ?? null);
      quotes[a.id] = rate === null ? null : { price: rate, date: "", prevPrice: rate, prevDate: null, converted: a.currency !== "CAD" };
      continue;
    }
    quotes[a.id] = latestCadQuote(byAsset.get(a.id) ?? [], fx);
  }
  return quotes;
}

export interface PortfolioData {
  today: string;
  accounts: Account[];
  assets: Asset[];
  transactions: Transaction[];
  ledger: Ledger;
  prices: PriceRow[];
  quotes: Record<string, CadQuote | null>;
  valuation: Valuation;
}

/** ホームなどで使う、ポートフォリオ全体の計算結果 */
export async function loadPortfolio(tx: Tx): Promise<PortfolioData> {
  const today = todayIn(TZ);
  // 同じトランザクション（1 接続）なので順番に読む
  const accounts = await loadAccounts(tx);
  const assets = await loadAssets(tx);
  const transactions = await loadTransactions(tx);
  const prices = await loadPrices(tx, { since: addDays(today, -120) });
  const fx = await loadFx(tx, addDays(today, -150));
  const ledger = computeLedger(transactions, accounts);
  const quotes = quotesFor(assets, prices, fx);
  const valuation = valuePortfolio(ledger.positions, quotes);
  return { today, accounts, assets, transactions, ledger, prices, quotes, valuation };
}
