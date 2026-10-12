import { fetchJson, refId, type AssetRef, type PriceProvider, type Quote } from "./types";

// Alpha Vantage 無料枠: 25 回/日。TSX は 'VFV.TRT' のような記号（assets.source_id に入れる）
const BASE = "https://www.alphavantage.co/query";

interface GlobalQuote {
  "Global Quote"?: { "05. price"?: string; "07. latest trading day"?: string };
  Note?: string;
  Information?: string;
}

interface DailySeries {
  "Time Series (Daily)"?: Record<string, { "4. close": string }>;
  Note?: string;
  Information?: string;
}

function key(): string {
  const k = process.env.ALPHAVANTAGE_API_KEY;
  if (!k) throw new Error("ALPHAVANTAGE_API_KEY が設定されていません");
  return k;
}

export const alphavantage: PriceProvider = {
  id: "alphavantage",
  isConfigured: () => Boolean(process.env.ALPHAVANTAGE_API_KEY),

  async fetchLatest(assets: AssetRef[]): Promise<Quote[]> {
    const out: Quote[] = [];
    for (const a of assets) {
      const data = await fetchJson<GlobalQuote>(
        `${BASE}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(refId(a))}&apikey=${key()}`,
      );
      if (data.Note || data.Information) throw new Error(`Alpha Vantage: ${data.Note ?? data.Information}`);
      const q = data["Global Quote"];
      const price = Number(q?.["05. price"]);
      const date = q?.["07. latest trading day"];
      if (!(price > 0) || !date) continue;
      out.push({ assetId: a.id, date, close: price, currency: a.currency, source: "alphavantage" });
    }
    return out;
  },

  async fetchHistory(asset: AssetRef, days: number): Promise<Quote[]> {
    const data = await fetchJson<DailySeries>(
      `${BASE}?function=TIME_SERIES_DAILY&outputsize=compact&symbol=${encodeURIComponent(refId(asset))}&apikey=${key()}`,
    );
    if (data.Note || data.Information) throw new Error(`Alpha Vantage: ${data.Note ?? data.Information}`);
    return Object.entries(data["Time Series (Daily)"] ?? {})
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .slice(0, days)
      .map(([date, v]) => ({
        assetId: asset.id,
        date,
        close: Number(v["4. close"]),
        currency: asset.currency,
        source: "alphavantage",
      }));
  },
};
