import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { runBackfill } from "@/lib/market/jobs";
import { ownerSql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 過去の価格・為替・恐怖強欲指数を取り込む（手動実行用）。?days=365 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const days = Math.max(1, Math.min(365, Number(new URL(request.url).searchParams.get("days") ?? 365) || 365));
  const results = await runBackfill(ownerSql(), { days });
  return NextResponse.json({ ok: results.every((r) => r.ok), results });
}
