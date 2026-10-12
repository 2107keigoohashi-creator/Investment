import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { cadSeries } from "@/lib/calc/portfolio";
import { loadFx, loadPrices } from "@/lib/data";
import { withUser } from "@/lib/db";
import { cadHistory } from "@/lib/market/history";
import type { HistoryRange } from "@/lib/market/yahoo";
import type { Asset } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const RANGES: HistoryRange[] = ["1y", "2y", "5y", "10y", "max"];

/** シミュレーター用の価格履歴（CAD）。Yahoo が使えなければ DB に保存した価格で代用する */
export async function GET(request: Request) {
  const { userId } = await requireUser();
  const sp = new URL(request.url).searchParams;
  const id = sp.get("asset") ?? "";
  const range = (RANGES.includes(sp.get("range") as HistoryRange) ? sp.get("range") : "5y") as HistoryRange;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "銘柄が不正です" }, { status: 400 });

  const asset = await withUser(userId, async (tx) => (await tx<Asset[]>`select * from assets where id = ${id}`)[0]);
  if (!asset) return NextResponse.json({ error: "銘柄が見つかりません" }, { status: 404 });

  try {
    const prices = await cadHistory(asset, range);
    if (prices.length > 1) return NextResponse.json({ source: "yahoo", prices });
  } catch (e) {
    console.error("[history] Yahoo から取れませんでした", e);
  }
  const fallback = await withUser(userId, async (tx) =>
    cadSeries(await loadPrices(tx, { assetId: asset.id }), await loadFx(tx)).map(({ date, close }) => ({ date, close })),
  );
  return NextResponse.json({ source: "db", prices: fallback });
}
