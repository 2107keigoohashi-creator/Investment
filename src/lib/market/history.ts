import "server-only";
import { fxOnOrBefore } from "../calc/portfolio";
import type { Asset } from "../types";
import { fetchYahooHistory, yahooSymbolFor, type HistoryRange } from "./yahoo";

const TTL_MS = 60 * 60_000;
const cache = new Map<string, { at: number; value: { date: string; close: number }[] }>();

/** 銘柄の日次終値（CAD 換算）。シミュレーター用に長い期間（最大 10 年）を Yahoo から取る */
export async function cadHistory(asset: Asset, range: HistoryRange): Promise<{ date: string; close: number }[]> {
  const symbol = yahooSymbolFor(asset);
  const key = `${symbol}:${range}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const rows = await fetchYahooHistory(symbol, range);
  let out: { date: string; close: number }[];
  const currency = rows[0]?.currency ?? "CAD";
  if (currency === "CAD") {
    out = rows.map(({ date, close }) => ({ date, close }));
  } else {
    // USD 建てはその日の USD/CAD で換算
    const fx = (await fetchYahooHistory(`${currency}CAD=X`, range)).map((r) => ({ date: r.date, rate: r.close }));
    out = rows.flatMap(({ date, close }) => {
      const r = fxOnOrBefore(fx, date);
      return r ? [{ date, close: close * r.rate }] : [];
    });
  }
  cache.set(key, { at: Date.now(), value: out });
  return out;
}
