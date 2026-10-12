import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { computeLedger, type Ledger } from "./calc/acb";
import { addDays, todayIn } from "./calc/dates";
import { latestCadQuote, valuePortfolio, type CadQuote, type FxPoint, type PricePoint, type Valuation } from "./calc/portfolio";
import { createClient } from "./supabase/server";
import type { Account, Asset, MarketMetric, PriceRow, Report, Transaction } from "./types";

export const TZ = "America/Vancouver";

type Db = Awaited<ReturnType<typeof createClient>>;

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export const getDb = cache(async () => createClient());

/** ログイン中のユーザー。いなければログイン画面へ */
export const requireUser = cache(async () => {
  const db = await getDb();
  const { data } = await db.auth.getClaims();
  const sub = data?.claims?.sub;
  if (!sub) redirect("/login");
  return { id: sub as string, email: (data?.claims?.email as string | undefined) ?? null };
});

/** PostgREST の 1000 行上限を超える場合に備えて、ページ送りで全部取る */
async function selectAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await build(from, from + size - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < size) break;
  }
  return out;
}

export function normalizeTx(r: Record<string, unknown>): Transaction {
  return {
    ...(r as unknown as Transaction),
    quantity: num(r.quantity),
    price: num(r.price),
    fee: num(r.fee),
    fx_rate: num(r.fx_rate) || 1,
    amount: num(r.amount),
    amount_cad: num(r.amount_cad),
    fee_cad: num(r.fee_cad),
  };
}

export async function loadAccounts(db: Db): Promise<Account[]> {
  const { data, error } = await db.from("accounts").select("*").order("sort_order").order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as Account[];
}

export async function loadAssets(db: Db): Promise<Asset[]> {
  const { data, error } = await db.from("assets").select("*").order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as Asset[];
}

export async function loadTransactions(db: Db, assetId?: string): Promise<Transaction[]> {
  const rows = await selectAll<Record<string, unknown>>((from, to) => {
    let q = db.from("transactions").select("*");
    if (assetId) q = q.eq("asset_id", assetId);
    return q.order("trade_date").order("created_at").range(from, to);
  });
  return rows.map(normalizeTx);
}

export async function loadPrices(db: Db, opts: { assetId?: string; since?: string } = {}): Promise<PriceRow[]> {
  const rows = await selectAll<Record<string, unknown>>((from, to) => {
    let q = db.from("prices").select("asset_id, date, close, currency, source");
    if (opts.assetId) q = q.eq("asset_id", opts.assetId);
    if (opts.since) q = q.gte("date", opts.since);
    return q.order("date").range(from, to);
  });
  return rows.map((r) => ({ ...(r as unknown as PriceRow), close: num(r.close) }));
}

/** 通貨ごとの「1 通貨 = rate CAD」の系列 */
export async function loadFx(db: Db, since?: string): Promise<Record<string, FxPoint[]>> {
  const rows = await selectAll<Record<string, unknown>>((from, to) => {
    let q = db.from("fx_rates").select("date, base, quote, rate").eq("quote", "CAD");
    if (since) q = q.gte("date", since);
    return q.order("date").range(from, to);
  });
  const out: Record<string, FxPoint[]> = {};
  for (const r of rows) {
    (out[r.base as string] ??= []).push({ date: r.date as string, rate: num(r.rate) });
  }
  return out;
}

export async function latestFx(db: Db, base = "USD"): Promise<FxPoint | null> {
  const { data } = await db
    .from("fx_rates")
    .select("date, rate")
    .eq("base", base)
    .eq("quote", "CAD")
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { date: data.date as string, rate: num(data.rate) } : null;
}

export async function latestMetric(db: Db, metric: string): Promise<MarketMetric | null> {
  const { data } = await db
    .from("market_metrics")
    .select("date, metric, value, label, source")
    .eq("metric", metric)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? ({ ...data, value: num(data.value) } as MarketMetric) : null;
}

export function normalizeReport(r: Record<string, unknown>): Report {
  return {
    ...(r as unknown as Report),
    events: Array.isArray(r.events) ? (r.events as Report["events"]) : [],
    sources: Array.isArray(r.sources) ? (r.sources as Report["sources"]) : [],
  };
}

export async function loadReports(db: Db, opts: { target?: string; limit?: number } = {}): Promise<Report[]> {
  let q = db.from("reports").select("*");
  if (opts.target) q = q.ilike("target", opts.target);
  const { data, error } = await q
    .order("report_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 100);
  if (error) throw new Error(error.message);
  return (data ?? []).map(normalizeReport);
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
  quotes: Record<string, CadQuote | null>;
  valuation: Valuation;
}

/** ホームなどで使う、ポートフォリオ全体の計算結果 */
export async function loadPortfolio(): Promise<PortfolioData> {
  await requireUser();
  const db = await getDb();
  const today = todayIn(TZ);
  const since = addDays(today, -120);
  const [accounts, assets, transactions, prices, fx] = await Promise.all([
    loadAccounts(db),
    loadAssets(db),
    loadTransactions(db),
    loadPrices(db, { since }),
    loadFx(db, addDays(today, -60)),
  ]);
  const ledger = computeLedger(transactions, accounts);
  const quotes = quotesFor(assets, prices, fx);
  const valuation = valuePortfolio(ledger.positions, quotes);
  return { today, accounts, assets, transactions, ledger, quotes, valuation };
}
