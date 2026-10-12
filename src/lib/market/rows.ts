import type { Asset, PriceRow } from "../types";

/** マーケット表示用の 1 行（銘柄の通貨での最新値・前日比・直近の値動き） */
export interface MarketRow {
  id: string;
  symbol: string;
  name: string;
  category: string;
  currency: string;
  price: number | null;
  changePct: number | null;
  date: string | null;
  /** スパークライン用の直近の終値（古い順） */
  spark: number[];
}

export function buildMarketRows(assets: Asset[], prices: PriceRow[], sparkPoints = 30): MarketRow[] {
  const byAsset = new Map<string, PriceRow[]>();
  for (const p of prices) {
    const arr = byAsset.get(p.asset_id) ?? [];
    arr.push(p);
    byAsset.set(p.asset_id, arr);
  }
  return assets
    .filter((a) => a.is_active && a.asset_type !== "cash")
    .map((a) => {
      const own = (byAsset.get(a.id) ?? [])
        .filter((p) => p.currency === a.currency)
        .sort((x, y) => (x.date < y.date ? -1 : 1));
      const last = own.at(-1);
      const prev = own.at(-2);
      return {
        id: a.id,
        symbol: a.symbol,
        name: a.name,
        category: a.category,
        currency: a.currency,
        price: last?.close ?? null,
        changePct: last && prev && prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : null,
        date: last?.date ?? null,
        spark: own.slice(-sparkPoints).map((p) => p.close),
      };
    });
}
