import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { loadAssets } from "@/lib/data";
import { withUser } from "@/lib/db";
import { getLiveQuotes } from "@/lib/market/live";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * リアルタイム価格。?ids=a,b,c で銘柄を絞る（なければ有効な銘柄すべて）。
 * 取れた価格は今日の終値として prices に保存するので、ホームの総資産やチャートにも反映される。
 */
export async function GET(request: Request) {
  const { userId } = await requireUser();
  const idsParam = new URL(request.url).searchParams.get("ids");
  const wanted = idsParam ? new Set(idsParam.split(",").filter(Boolean)) : null;

  const assets = (await withUser(userId, loadAssets)).filter(
    (a) => a.is_active && a.asset_type !== "cash" && (!wanted || wanted.has(a.id)),
  );
  const { quotes, usdCad } = await getLiveQuotes(assets);

  const rows = quotes.flatMap((q) => q.rows.map((r) => ({ asset_id: q.assetId, ...r })));
  if (rows.length > 0) {
    try {
      await withUser(userId, (tx) =>
        tx`insert into prices ${tx(rows, "asset_id", "date", "close", "currency", "source")}
          on conflict (user_id, asset_id, date, currency)
          do update set close = excluded.close, source = excluded.source, fetched_at = now()`,
      );
    } catch (e) {
      console.error("[live] 価格の保存に失敗", e);
    }
  }

  return NextResponse.json(
    {
      at: new Date().toISOString(),
      usdCad,
      quotes: quotes.map((q) => ({
        assetId: q.assetId,
        symbol: q.symbol,
        price: q.price,
        currency: q.currency,
        priceCad: q.priceCad,
        changePct: q.changePct,
        date: q.date,
        time: q.time,
      })),
      missing: assets.filter((a) => !quotes.some((q) => q.assetId === a.id)).map((a) => a.symbol),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
