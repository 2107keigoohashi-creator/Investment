import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { searchYahoo } from "@/lib/market/yahoo";

export const dynamic = "force-dynamic";

/** 銘柄検索（Yahoo Finance） */
export async function GET(request: Request) {
  await requireUser();
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 40);
  if (q.length < 1) return NextResponse.json({ results: [] });
  try {
    return NextResponse.json({ results: await searchYahoo(q) });
  } catch {
    return NextResponse.json({ results: [], error: "検索できませんでした。時間をおいて試してください" });
  }
}
