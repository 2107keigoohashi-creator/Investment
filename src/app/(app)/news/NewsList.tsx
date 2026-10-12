import { timeAgo } from "@/lib/format";
import { NEWS_CATEGORIES } from "@/lib/news/fetch";
import type { NewsItem } from "@/lib/types";

const LABEL = Object.fromEntries(NEWS_CATEGORIES.map((c) => [c.key, c.label]));

/** Google 翻訳で記事を日本語にして開く */
function translateUrl(url: string) {
  return `https://translate.google.com/translate?sl=auto&tl=ja&u=${encodeURIComponent(url)}`;
}

export function NewsList({ items, compact = false }: { items: NewsItem[]; compact?: boolean }) {
  return (
    <ul className="card divide-y divide-border">
      {items.map((n) => (
        <li key={n.id} className="px-4 py-3">
          <a href={n.url} target="_blank" rel="noreferrer" className="block">
            <p className={`leading-snug ${compact ? "text-sm" : "text-[15px] font-medium"}`}>{n.title}</p>
          </a>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            {!compact && <span className="tag">{LABEL[n.category] ?? n.category}</span>}
            {n.lang === "en" && <span className="tag tag-accent">海外</span>}
            <span>{n.source ?? ""}</span>
            {n.published_at && <span className="num">{timeAgo(n.published_at)}</span>}
            {n.lang === "en" && (
              <a href={translateUrl(n.url)} target="_blank" rel="noreferrer" className="ml-auto text-accent">
                日本語で読む →
              </a>
            )}
          </p>
        </li>
      ))}
    </ul>
  );
}
