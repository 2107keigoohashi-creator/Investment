import { NextResponse } from "next/server";
import { hourIn } from "@/lib/calc/dates";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { runDailyFetch } from "@/lib/market/jobs";
import { ownerSql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 毎朝 6:30（America/Vancouver）のデータ取得。
 * Vercel Cron は UTC 指定なので、夏時間（13:30 UTC）と冬時間（14:30 UTC）の 2 本を登録し、
 * バンクーバー時間で 6 時台のときだけ実行する（?force=1 で時刻チェックを飛ばす）。
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const force = new URL(request.url).searchParams.get("force") === "1";
  const hour = hourIn("America/Vancouver");
  if (!force && hour !== 6) {
    return NextResponse.json({ skipped: true, reason: `バンクーバー時間 ${hour} 時のためスキップ` });
  }
  const results = await runDailyFetch(ownerSql());
  const ok = results.every((r) => r.ok);
  return NextResponse.json({ ok, results }, { status: ok ? 200 : 207 });
}
