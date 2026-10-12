import "server-only";
import type { Tx } from "../db";
import type { NewsItem } from "../types";

export async function loadNews(tx: Tx, opts: { category?: string; limit?: number } = {}): Promise<NewsItem[]> {
  const limit = opts.limit ?? 60;
  return opts.category
    ? tx<NewsItem[]>`select id, category, title, url, source, published_at from news
        where category = ${opts.category} order by coalesce(published_at, fetched_at) desc limit ${limit}`
    : tx<NewsItem[]>`select id, category, title, url, source, published_at from news
        order by coalesce(published_at, fetched_at) desc limit ${limit}`;
}
