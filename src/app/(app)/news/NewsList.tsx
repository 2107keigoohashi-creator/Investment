import { timeAgo } from "@/lib/format";
import { NEWS_CATEGORIES } from "@/lib/news/fetch";
import type { NewsItem } from "@/lib/types";

const LABEL = Object.fromEntries(NEWS_CATEGORIES.map((c) => [c.key, c.label]));

export function NewsList({ items, compact = false }: { items: NewsItem[]; compact?: boolean }) {
  return (
    <ul className="card divide-y divide-border">
      {items.map((n) => (
        <li key={n.id}>
          <a href={n.url} target="_blank" rel="noreferrer" className="block px-4 py-3">
            <p className={`leading-snug ${compact ? "text-sm" : "text-[15px] font-medium"}`}>{n.title}</p>
            <p className="mt-1 text-xs text-muted">
              {!compact && <span className="mr-1 rounded bg-surface-2 px-1.5 py-0.5">{LABEL[n.category] ?? n.category}</span>}
              {n.source ?? ""}
              {n.published_at ? ` · ${timeAgo(n.published_at)}` : ""}
            </p>
          </a>
        </li>
      ))}
    </ul>
  );
}
