import "server-only";
import { ownerSql } from "../db";
import { parseRss, type RssItem } from "./rss";

/**
 * 株・暗号資産に関係しそうなニュースを Google ニュースの RSS（キー不要）から取る。
 * 1 日 3 回（Cron）＋ 画面を開いたときに 6 時間以上たっていれば取り直す。
 */

export const NEWS_CATEGORIES = [
  { key: "btc", label: "ビットコイン" },
  { key: "us", label: "米国株" },
  { key: "canada", label: "カナダ" },
  { key: "macro", label: "金利・経済" },
] as const;

interface Feed {
  category: (typeof NEWS_CATEGORIES)[number]["key"];
  query: string;
  lang: "ja" | "en-CA";
}

const FEEDS: Feed[] = [
  { category: "btc", query: "ビットコイン OR 暗号資産 OR ビットコインETF when:2d", lang: "ja" },
  { category: "us", query: "米国株 OR NYダウ OR ナスダック OR S&P500 when:1d", lang: "ja" },
  { category: "canada", query: "TSX stocks OR Bank of Canada OR Canadian economy when:2d", lang: "en-CA" },
  { category: "macro", query: "FRB OR FOMC OR 利下げ OR 米CPI OR 雇用統計 OR 日銀 when:2d", lang: "ja" },
];

const PER_FEED = 15;
export const STALE_HOURS = 6;

function feedUrl(f: Feed) {
  const q = encodeURIComponent(f.query);
  return f.lang === "ja"
    ? `https://news.google.com/rss/search?q=${q}&hl=ja&gl=JP&ceid=JP:ja`
    : `https://news.google.com/rss/search?q=${q}&hl=en-CA&gl=CA&ceid=CA:en`;
}

async function fetchFeed(f: Feed): Promise<RssItem[]> {
  const res = await fetch(feedUrl(f), {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MaruInvest/1.0)" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Google ニュースが ${res.status} を返しました`);
  return parseRss(await res.text()).slice(0, PER_FEED);
}

export async function refreshNews(): Promise<{ inserted: number; errors: string[] }> {
  const db = ownerSql();
  const errors: string[] = [];
  let inserted = 0;
  for (const f of FEEDS) {
    try {
      const items = await fetchFeed(f);
      if (items.length === 0) continue;
      const rows = items.map((i) => ({
        category: f.category,
        title: i.title,
        url: i.url,
        source: i.source,
        published_at: i.publishedAt,
      }));
      const res = await db`insert into news ${db(rows)} on conflict (url) do nothing`;
      inserted += res.count;
    } catch (e) {
      errors.push(`${f.category}: ${e instanceof Error ? e.message : e}`);
    }
  }
  // 古いニュースは消す
  await db`delete from news where coalesce(published_at, fetched_at) < now() - interval '14 days'`;
  await db`insert into news_fetches (items, ok, error)
    values (${inserted}, ${errors.length < FEEDS.length}, ${errors.length ? errors.join(" / ") : null})`;
  await db`delete from news_fetches where fetched_at < now() - interval '30 days'`;
  return { inserted, errors };
}

export async function lastNewsFetch(): Promise<string | null> {
  const rows = await ownerSql()<{ fetched_at: string }[]>`
    select fetched_at from news_fetches where ok order by fetched_at desc limit 1`;
  return rows[0]?.fetched_at ?? null;
}

/** 最後の取得から STALE_HOURS 以上たっていれば取り直す（失敗しても画面は壊さない） */
export async function ensureFreshNews(): Promise<void> {
  try {
    const last = await lastNewsFetch();
    if (last && Date.now() - Date.parse(last) < STALE_HOURS * 3_600_000) return;
    await refreshNews();
  } catch (e) {
    console.error("[news] 更新に失敗", e);
  }
}
