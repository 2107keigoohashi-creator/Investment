import type { Metadata } from "next";
import { TickerTape } from "@/components/TickerTape";
import { addDays, todayIn } from "@/lib/calc/dates";
import { asUser, loadAssets, loadPrices, TZ } from "@/lib/data";
import { buildMarketRows } from "@/lib/market/rows";
import { MarketBoard } from "./MarketBoard";

export const metadata: Metadata = { title: "マーケット" };
export const dynamic = "force-dynamic";

export default async function MarketPage() {
  const today = todayIn(TZ);
  const { assets, prices } = await asUser(async (tx) => ({
    assets: await loadAssets(tx),
    prices: await loadPrices(tx, { since: addDays(today, -45) }),
  }));
  const rows = buildMarketRows(assets, prices);
  return (
    <>
      <div className="pt-1">
        <TickerTape rows={rows} />
      </div>
      <MarketBoard rows={rows} today={today} />
    </>
  );
}
