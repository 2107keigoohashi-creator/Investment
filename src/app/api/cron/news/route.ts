import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { refreshNews } from "@/lib/news/fetch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** ニュースの更新（1 日 3 回: バンクーバー時間の朝・昼・夕方） */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const r = await refreshNews();
  return NextResponse.json({ ok: r.errors.length === 0, ...r });
}
