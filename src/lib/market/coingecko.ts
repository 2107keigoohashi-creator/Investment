import { formatDate } from "../calc/dates";
import { fetchJson, refId, type AssetRef, type PriceProvider, type Quote } from "./types";

const BASE = "https://api.coingecko.com/api/v3";
/** 暗号資産は CAD と USD の両方を保存する */
const VS = ["cad", "usd"] as const;

function headers(): HeadersInit {
  const key = process.env.COINGECKO_API_KEY;
  return key ? { "x-cg-demo-api-key": key } : {};
}

export const coingecko: PriceProvider = {
  id: "coingecko",
  isConfigured: () => true, // キーなしでも使える（あればレート制限が緩くなる）

  async fetchLatest(assets: AssetRef[], today: string): Promise<Quote[]> {
    if (assets.length === 0) return [];
    const ids = [...new Set(assets.map(refId))].join(",");
    const data = await fetchJson<Record<string, Record<string, number>>>(
      `${BASE}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=${VS.join(",")}`,
      { headers: headers() },
    );
    const out: Quote[] = [];
    for (const a of assets) {
      const row = data[refId(a)];
      if (!row) continue;
      for (const vs of VS) {
        const v = row[vs];
        if (typeof v === "number" && v > 0) {
          out.push({ assetId: a.id, date: today, close: v, currency: vs.toUpperCase(), source: "coingecko" });
        }
      }
    }
    return out;
  },

  async fetchHistory(asset: AssetRef, days: number): Promise<Quote[]> {
    const out: Quote[] = [];
    for (const vs of VS) {
      const data = await fetchJson<{ prices: [number, number][] }>(
        `${BASE}/coins/${encodeURIComponent(refId(asset))}/market_chart?vs_currency=${vs}&days=${Math.min(days, 365)}&interval=daily`,
        { headers: headers(), timeoutMs: 30_000 },
      );
      // 同じ日付が複数あれば最後の値を使う
      const byDate = new Map<string, number>();
      for (const [ms, price] of data.prices ?? []) byDate.set(formatDate(new Date(ms)), price);
      for (const [date, close] of byDate) {
        out.push({ assetId: asset.id, date, close, currency: vs.toUpperCase(), source: "coingecko" });
      }
    }
    return out;
  },
};
