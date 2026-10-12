import type { Metadata } from "next";
import Link from "next/link";
import { Empty } from "@/components/ui";
import { asUser } from "@/lib/data";
import { formatDateTimeVan } from "@/lib/format";
import { loadNews } from "@/lib/news/data";
import { ensureFreshNews, lastNewsFetch, NEWS_CATEGORIES } from "@/lib/news/fetch";
import { NewsList } from "./NewsList";
import { RefreshNewsButton } from "./RefreshNewsButton";

export const metadata: Metadata = { title: "ニュース" };
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export default async function NewsPage({ searchParams }: PageProps<"/news">) {
  const sp = await searchParams;
  const cat = typeof sp.c === "string" && NEWS_CATEGORIES.some((c) => c.key === sp.c) ? sp.c : undefined;
  // Cron が動かなかった場合に備え、6 時間以上たっていれば開いたときに取り直す
  await ensureFreshNews();
  const [items, last] = await Promise.all([
    asUser((tx) => loadNews(tx, { category: cat, limit: 80 })),
    lastNewsFetch(),
  ]);

  return (
    <>
      <header className="mb-1 flex items-center justify-between pt-2">
        <h1 className="text-xl font-bold">ニュース</h1>
        <RefreshNewsButton />
      </header>
      <p className="mb-3 text-xs text-muted">
        最終更新 {formatDateTimeVan(last)}・毎日 6 時 / 12 時 / 18 時ごろ（バンクーバー時間）に自動更新
      </p>

      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href="/news" className="chip" aria-current={!cat ? "page" : undefined}>
          すべて
        </Link>
        {NEWS_CATEGORIES.map((c) => (
          <Link key={c.key} href={`/news?c=${c.key}`} className="chip" aria-current={cat === c.key ? "page" : undefined}>
            {c.label}
          </Link>
        ))}
      </div>

      {items.length === 0 ? <Empty>ニュースをまだ取得できていません。右上の「更新」を押してください。</Empty> : <NewsList items={items} />}

      <p className="mt-4 px-1 text-xs text-muted">出典: Google ニュース。見出しは各媒体のものです。投資判断の材料の一つとして見てください。</p>
    </>
  );
}
