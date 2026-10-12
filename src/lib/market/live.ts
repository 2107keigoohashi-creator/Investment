import "server-only";
import { todayIn } from "../calc/dates";
import type { Asset } from "../types";
import { fetchJson } from "./types";
import { fetchYahooQuote, mapLimit } from "./yahoo";

/**
 * 画面を開いている間のリアルタイム価格。
 * - 暗号資産: CoinGecko（CAD と USD、24 時間の変化率）
 * - 株・ETF: Yahoo Finance（米国株はほぼリアルタイム、TSX は最大 15 分遅れのことがある）
 * 同じ銘柄を何度も取りに行かないよう、60 秒だけメモリにキャッシュする。
 */

export interface LiveQuote {
  assetId: string;
  symbol: string;
  /** 銘柄の通貨での価格 */
  price: number;
  currency: string;
  /** CAD 換算の価格 */
  priceCad: number | null;
  changePct: number | null;
  date: string;
  /** 価格の時刻（UNIX 秒） */
  time: number;
  source: "coingecko" | "yahoo";
  /** DB に保存する行（暗号資産は CAD と USD の 2 行） */
  rows: { date: string; close: number; currency: string; source: string }[];
}

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** USD/CAD のリアルタイム値（Yahoo の USDCAD=X）。取れなければ null */
export async function liveUsdCad(): Promise<number | null> {
  try {
    const q = await cached("fx:USDCAD", () => fetchYahooQuote("USDCAD=X"));
    return q?.price ?? null;
  } catch {
    return null;
  }
}

async function cryptoQuotes(assets: Asset[]): Promise<LiveQuote[]> {
  if (assets.length === 0) return [];
  const ids = [...new Set(assets.map((a) => a.source_id || a.symbol.toLowerCase()))].sort();
  const data = await cached(`cg:${ids.join(",")}`, () =>
    fetchJson<Record<string, Record<string, number>>>(
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(","))}&vs_currencies=cad,usd&include_24hr_change=true&include_last_updated_at=true`,
      { headers: process.env.COINGECKO_API_KEY ? { "x-cg-demo-api-key": process.env.COINGECKO_API_KEY } : {} },
    ),
  );
  const today = todayIn("America/Vancouver");
  const out: LiveQuote[] = [];
  for (const a of assets) {
    const row = data[a.source_id || a.symbol.toLowerCase()];
    if (!row || !(row.cad > 0)) continue;
    const rows = [{ date: today, close: row.cad, currency: "CAD", source: "coingecko" }];
    if (row.usd > 0) rows.push({ date: today, close: row.usd, currency: "USD", source: "coingecko" });
    out.push({
      assetId: a.id,
      symbol: a.symbol,
      price: row.cad,
      currency: "CAD",
      priceCad: row.cad,
      changePct: typeof row.cad_24h_change === "number" ? row.cad_24h_change : null,
      date: today,
      time: row.last_updated_at ?? Math.floor(Date.now() / 1000),
      source: "coingecko",
      rows,
    });
  }
  return out;
}

async function yahooQuotes(assets: Asset[], usdCad: number | null): Promise<LiveQuote[]> {
  const results = await mapLimit(assets, 4, async (a) => {
    const sym = a.source_id || a.symbol;
    try {
      const q = await cached(`yf:${sym}`, () => fetchYahooQuote(sym));
      if (!q) return null;
      const priceCad = q.currency === "CAD" ? q.price : q.currency === "USD" && usdCad ? q.price * usdCad : null;
      return {
        assetId: a.id,
        symbol: a.symbol,
        price: q.price,
        currency: q.currency,
        priceCad,
        changePct: q.previousClose ? ((q.price - q.previousClose) / q.previousClose) * 100 : null,
        date: q.date,
        time: q.time,
        source: "yahoo" as const,
        rows: [{ date: q.date, close: q.price, currency: q.currency, source: "yahoo" }],
      };
    } catch {
      return null;
    }
  });
  return results.filter((x): x is NonNullable<typeof x> => x !== null);
}

export async function getLiveQuotes(assets: Asset[]): Promise<{ quotes: LiveQuote[]; usdCad: number | null }> {
  const crypto = assets.filter((a) => a.price_source === "coingecko");
  const stocks = assets.filter((a) => a.price_source === "yahoo");
  const usdCad = stocks.some((a) => a.currency !== "CAD") ? await liveUsdCad() : null;
  const [c, s] = await Promise.all([cryptoQuotes(crypto).catch(() => []), yahooQuotes(stocks, usdCad)]);
  return { quotes: [...c, ...s], usdCad };
}
