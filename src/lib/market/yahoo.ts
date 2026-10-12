import { todayIn } from "../calc/dates";
import { refId, type AssetRef, type PriceProvider, type Quote } from "./types";

/**
 * Yahoo Finance（非公式・キー不要）。株・ETF・暗号資産（BTC-CAD など）・為替（USDCAD=X）に使う。
 * 非公式 API なので仕様が変わることがある。失敗したら呼び出し側で前回の値にフォールバックする。
 */

const BASES = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; MaruInvest/1.0; personal use)",
  Accept: "application/json",
};

interface ChartMeta {
  symbol: string;
  currency?: string;
  exchangeTimezoneName?: string;
  regularMarketPrice?: number;
  regularMarketTime?: number;
  previousClose?: number;
  chartPreviousClose?: number;
  shortName?: string;
  longName?: string;
}

export interface ChartResponse {
  chart?: {
    result?: Array<{
      meta: ChartMeta;
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: (number | null)[] }>; adjclose?: Array<{ adjclose?: (number | null)[] }> };
    }> | null;
    error?: { code?: string; description?: string } | null;
  };
}

async function getJson<T>(path: string, timeoutMs = 15_000): Promise<T> {
  let lastError: unknown;
  for (const base of BASES) {
    try {
      const res = await fetch(`${base}${path}`, {
        headers: HEADERS,
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`Yahoo Finance が ${res.status} を返しました`);
      return (await res.json()) as T;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export interface LiveQuote {
  symbol: string;
  price: number;
  previousClose: number | null;
  currency: string;
  /** 取引所の現地日付（YYYY-MM-DD） */
  date: string;
  time: number;
  name?: string;
}

export function parseChartQuote(data: ChartResponse): LiveQuote | null {
  const r = data.chart?.result?.[0];
  const m = r?.meta;
  if (!m || !(Number(m.regularMarketPrice) > 0)) return null;
  const time = m.regularMarketTime ?? Math.floor(Date.now() / 1000);
  return {
    symbol: m.symbol,
    price: Number(m.regularMarketPrice),
    previousClose: m.previousClose ?? m.chartPreviousClose ?? null,
    currency: (m.currency ?? "USD").toUpperCase(),
    date: todayIn(m.exchangeTimezoneName ?? "America/New_York", new Date(time * 1000)),
    time,
    name: m.longName ?? m.shortName,
  };
}

/** 日足の終値（日付は取引所の現地日付） */
export function parseChartHistory(data: ChartResponse): { date: string; close: number; currency: string }[] {
  const r = data.chart?.result?.[0];
  if (!r?.timestamp) return [];
  const tz = r.meta.exchangeTimezoneName ?? "America/New_York";
  const closes = r.indicators?.quote?.[0]?.close ?? [];
  const currency = (r.meta.currency ?? "USD").toUpperCase();
  const byDate = new Map<string, number>();
  r.timestamp.forEach((t, i) => {
    const c = closes[i];
    if (typeof c === "number" && c > 0) byDate.set(todayIn(tz, new Date(t * 1000)), c);
  });
  return [...byDate].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, close]) => ({ date, close, currency }));
}

export async function fetchYahooQuote(symbol: string): Promise<LiveQuote | null> {
  const data = await getJson<ChartResponse>(
    `/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d&includePrePost=false`,
  );
  return parseChartQuote(data);
}

export type HistoryRange = "1mo" | "3mo" | "6mo" | "1y" | "2y" | "5y" | "10y" | "max";

export async function fetchYahooHistory(symbol: string, range: HistoryRange = "1y") {
  const data = await getJson<ChartResponse>(
    `/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&includePrePost=false`,
    30_000,
  );
  return parseChartHistory(data);
}

/** 並列数を絞って順に取る（レート制限対策） */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

export const yahoo: PriceProvider = {
  id: "yahoo",
  isConfigured: () => true,

  async fetchLatest(assets: AssetRef[]): Promise<Quote[]> {
    const errors: string[] = [];
    const quotes = await mapLimit(assets, 4, async (a) => {
      try {
        const q = await fetchYahooQuote(refId(a));
        return q ? { assetId: a.id, date: q.date, close: q.price, currency: q.currency, source: "yahoo" } : null;
      } catch (e) {
        errors.push(`${a.symbol}: ${e instanceof Error ? e.message : e}`);
        return null;
      }
    });
    const ok = quotes.filter((q): q is Quote => q !== null);
    if (ok.length === 0 && errors.length > 0) throw new Error(errors.slice(0, 3).join(" / "));
    return ok;
  },

  async fetchHistory(asset: AssetRef, days: number): Promise<Quote[]> {
    const range: HistoryRange = days <= 31 ? "1mo" : days <= 93 ? "3mo" : days <= 186 ? "6mo" : days <= 366 ? "1y" : days <= 731 ? "2y" : "5y";
    const rows = await fetchYahooHistory(refId(asset), range);
    return rows.map((r) => ({ assetId: asset.id, date: r.date, close: r.close, currency: r.currency, source: "yahoo" }));
  },
};

// ---------------------------------------------------------------------------
// 銘柄検索
// ---------------------------------------------------------------------------

export interface SearchResult {
  symbol: string;
  name: string;
  exchange: string | null;
  type: "stock" | "etf" | "crypto";
}

interface SearchResponse {
  quotes?: Array<{ symbol?: string; shortname?: string; longname?: string; exchDisp?: string; quoteType?: string }>;
}

export function parseSearch(data: SearchResponse): SearchResult[] {
  const out: SearchResult[] = [];
  for (const q of data.quotes ?? []) {
    if (!q.symbol) continue;
    const t = q.quoteType?.toUpperCase();
    const type = t === "EQUITY" ? "stock" : t === "ETF" || t === "MUTUALFUND" ? "etf" : t === "CRYPTOCURRENCY" ? "crypto" : null;
    if (!type) continue;
    out.push({ symbol: q.symbol, name: q.longname ?? q.shortname ?? q.symbol, exchange: q.exchDisp ?? null, type });
  }
  return out;
}

export async function searchYahoo(query: string): Promise<SearchResult[]> {
  const data = await getJson<SearchResponse>(
    `/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0&listsCount=0`,
  );
  return parseSearch(data);
}

/** Yahoo での記号（暗号資産は BTC-CAD のような形） */
export function yahooSymbolFor(a: { symbol: string; source_id: string | null; price_source: string; asset_type: string }) {
  if (a.price_source === "yahoo") return a.source_id || a.symbol;
  if (a.asset_type === "crypto") return `${a.symbol}-CAD`;
  return a.source_id || a.symbol;
}
