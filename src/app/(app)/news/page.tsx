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
export const maxDuration = 60;

const LANGS = [
  { key: "", label: "すべて" },
  { key: "ja", label: "日本語" },
  { key: "en", label: "海外" },
] as const;

export default async function NewsPage({ searchParams }: PageProps<"/news">) {
  const sp = await searchParams;
  const cat = typeof sp.c === "string" && NEWS_CATEGORIES.some((c) => c.key === sp.c) ? sp.c : undefined;
  const lang = sp.l === "ja" || sp.l === "en" ? sp.l : undefined;
  // Cron が動かなかった場合に備え、6 時間以上たっていれば開いたときに取り直す
  await ensureFreshNews();
  const [items, last] = await Promise.all([
    asUser((tx) => loadNews(tx, { category: cat, lang, limit: 100 })),
    lastNewsFetch(),
  ]);

  const href = (c?: string, l?: string) => {
    const q = new URLSearchParams();
    if (c) q.set("c", c);
    if (l) q.set("l", l);
    const s = q.toString();
    return s ? `/news?${s}` : "/news";
  };

  return (
    <>
      <header className="mb-1 flex items-center justify-between pt-2">
        <h1 className="text-xl font-bold tracking-tight">ニュース</h1>
        <RefreshNewsButton />
      </header>
      <p className="mb-3 text-xs text-muted">
        最終更新 <span className="num">{formatDateTimeVan(last)}</span>・毎日 6 時 / 12 時 / 18 時ごろ（バンクーバー時間）に自動更新
      </p>

      <div className="mb-2 grid grid-cols-3 gap-2">
        {LANGS.map((l) => (
          <Link key={l.key} href={href(cat, l.key || undefined)} className="chip text-center" aria-current={(lang ?? "") === l.key ? "page" : undefined}>
            {l.label}
          </Link>
        ))}
      </div>
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href={href(undefined, lang)} className="chip" aria-current={!cat ? "page" : undefined}>
          全カテゴリ
        </Link>
        {NEWS_CATEGORIES.map((c) => (
          <Link key={c.key} href={href(c.key, lang)} className="chip" aria-current={cat === c.key ? "page" : undefined}>
            {c.label}
          </Link>
        ))}
      </div>

      {items.length === 0 ? <Empty>ニュースをまだ取得できていません。右上の「更新」を押してください。</Empty> : <NewsList items={items} />}

      <p className="mt-4 px-1 text-xs text-muted">
        出典: Google ニュース、CoinDesk、Cointelegraph、Decrypt、CNBC、MarketWatch、Yahoo Finance、BBC、CBC。見出しは各媒体のものです。海外記事は「日本語で読む」で Google 翻訳を開けます。
      </p>
    </>
  );
}
