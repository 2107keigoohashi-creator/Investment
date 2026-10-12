import { todayIn } from "../calc/dates";
import { fetchJson, refId, type AssetRef, type PriceProvider, type Quote } from "./types";

// Finnhub 無料枠: /quote のみ（日足の履歴は有料）。60 回/分
const BASE = "https://finnhub.io/api/v1";

export const finnhub: PriceProvider = {
  id: "finnhub",
  isConfigured: () => Boolean(process.env.FINNHUB_API_KEY),

  async fetchLatest(assets: AssetRef[]): Promise<Quote[]> {
    const token = process.env.FINNHUB_API_KEY;
    if (!token) throw new Error("FINNHUB_API_KEY が設定されていません");
    const out: Quote[] = [];
    for (const a of assets) {
      const q = await fetchJson<{ c: number; t: number }>(
        `${BASE}/quote?symbol=${encodeURIComponent(refId(a))}&token=${token}`,
      );
      if (!q || !(q.c > 0)) continue;
      out.push({
        assetId: a.id,
        date: todayIn("America/New_York", new Date(q.t * 1000)),
        close: q.c,
        currency: a.currency,
        source: "finnhub",
      });
    }
    return out;
  },
};
