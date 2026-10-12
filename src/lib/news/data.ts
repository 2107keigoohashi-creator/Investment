import "server-only";
import type { Tx } from "../db";
import type { NewsItem } from "../types";

export async function loadNews(
  tx: Tx,
  opts: { category?: string; lang?: "ja" | "en"; limit?: number } = {},
): Promise<NewsItem[]> {
  const limit = opts.limit ?? 60;
  const cat = opts.category ?? null;
  const lang = opts.lang ?? null;
  return tx<NewsItem[]>`
    select id, category, lang, title, url, source, published_at from news
    where (${cat}::text is null or category = ${cat}) and (${lang}::text is null or lang = ${lang})
    order by coalesce(published_at, fetched_at) desc
    limit ${limit}`;
}
