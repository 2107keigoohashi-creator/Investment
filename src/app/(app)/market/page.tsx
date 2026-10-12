import type { Metadata } from "next";
import { addDays, todayIn } from "@/lib/calc/dates";
import { asUser, loadAssets, loadPrices, TZ } from "@/lib/data";
import { MarketBoard, type MarketRow } from "./MarketBoard";

export const metadata: Metadata = { title: "マーケット" };
export const dynamic = "force-dynamic";

export default async function MarketPage() {
  const today = todayIn(TZ);
  const { assets, prices } = await asUser(async (tx) => ({
    assets: await loadAssets(tx),
    prices: await loadPrices(tx, { since: addDays(today, -14) }),
  }));

  const rows: MarketRow[] = assets
    .filter((a) => a.is_active && a.asset_type !== "cash")
    .map((a) => {
      // 銘柄の通貨での最新値と、その前の日の値
      const own = prices.filter((p) => p.asset_id === a.id && p.currency === a.currency);
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
      };
    });

  return <MarketBoard rows={rows} today={today} />;
}
