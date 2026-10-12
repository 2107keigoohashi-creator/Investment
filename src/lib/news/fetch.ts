import "server-only";
import { ownerSql } from "../db";
import { mapLimit } from "../market/yahoo";
import { parseRss, type RssItem } from "./rss";

/**
 * 株・暗号資産に関係しそうなニュースを、キー不要の RSS から取る。
 * - 日本語: Google ニュース（日本版）
 * - 海外: CoinDesk / Cointelegraph / Decrypt / CNBC / MarketWatch / Yahoo Finance / BBC / CBC と Google ニュース（米国・カナダ版）
 * 1 日 3 回（Cron）＋ 画面を開いたときに 6 時間以上たっていれば取り直す。
 */

export const NEWS_CATEGORIES = [
  { key: "btc", label: "ビットコイン" },
  { key: "us", label: "米国株" },
  { key: "canada", label: "カナダ" },
  { key: "macro", label: "金利・経済" },
] as const;

type Category = (typeof NEWS_CATEGORIES)[number]["key"];

interface Feed {
  category: Category;
  lang: "ja" | "en";
  /** 媒体名（RSS に source がないとき使う） */
  name: string;
  url: string;
}

const google = (q: string, edition: "JP" | "US" | "CA") => {
  const p = { JP: "hl=ja&gl=JP&ceid=JP:ja", US: "hl=en-US&gl=US&ceid=US:en", CA: "hl=en-CA&gl=CA&ceid=CA:en" }[edition];
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${p}`;
};

export const FEEDS: Feed[] = [
  // 日本語
  { category: "btc", lang: "ja", name: "Google ニュース", url: google("ビットコイン OR 暗号資産 OR ビットコインETF when:2d", "JP") },
  { category: "us", lang: "ja", name: "Google ニュース", url: google("米国株 OR NYダウ OR ナスダック OR S&P500 when:1d", "JP") },
  { category: "macro", lang: "ja", name: "Google ニュース", url: google("FRB OR FOMC OR 利下げ OR 米CPI OR 雇用統計 OR 日銀 when:2d", "JP") },
  // 海外: 暗号資産
  { category: "btc", lang: "en", name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { category: "btc", lang: "en", name: "Cointelegraph", url: "https://cointelegraph.com/rss" },
  { category: "btc", lang: "en", name: "Decrypt", url: "https://decrypt.co/feed" },
  { category: "btc", lang: "en", name: "Google News", url: google("bitcoin OR \"bitcoin ETF\" when:1d", "US") },
  // 海外: 米国株
  { category: "us", lang: "en", name: "CNBC", url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=15839069" },
  { category: "us", lang: "en", name: "MarketWatch", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories" },
  { category: "us", lang: "en", name: "Yahoo Finance", url: "https://finance.yahoo.com/news/rssindex" },
  { category: "us", lang: "en", name: "Google News", url: google("stock market OR Nasdaq OR \"S&P 500\" when:1d", "US") },
  // 海外: カナダ
  { category: "canada", lang: "en", name: "CBC Business", url: "https://www.cbc.ca/webfeed/rss/rss-business" },
  { category: "canada", lang: "en", name: "Google News", url: google("TSX stocks OR \"Bank of Canada\" OR \"Canadian economy\" when:2d", "CA") },
  // 海外: 金利・経済
  { category: "macro", lang: "en", name: "CNBC Economy", url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258" },
  { category: "macro", lang: "en", name: "BBC Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  { category: "macro", lang: "en", name: "Google News", url: google("\"Federal Reserve\" OR inflation OR \"interest rates\" when:1d", "US") },
];

const PER_FEED = 12;
const MAX_AGE_DAYS = 3;
export const STALE_HOURS = 6;

async function fetchFeed(f: Feed): Promise<RssItem[]> {
  const res = await fetch(f.url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; MaruInvest/1.0; personal news reader)",
      Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;
  return parseRss(await res.text())
    .filter((i) => !i.publishedAt || Date.parse(i.publishedAt) >= cutoff)
    .slice(0, PER_FEED);
}

export async function refreshNews(): Promise<{ inserted: number; errors: string[] }> {
  const db = ownerSql();
  const errors: string[] = [];
  let inserted = 0;
  await mapLimit(FEEDS, 6, async (f) => {
    try {
      const items = await fetchFeed(f);
      if (items.length === 0) return;
      const rows = items.map((i) => ({
        category: f.category,
        lang: f.lang,
        title: i.title,
        url: i.url,
        source: i.source ?? f.name,
        published_at: i.publishedAt,
      }));
      const res = await db`insert into news ${db(rows)} on conflict (url) do nothing`;
      inserted += res.count;
    } catch (e) {
      errors.push(`${f.name}(${f.category}): ${e instanceof Error ? e.message : e}`);
    }
  });
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

// 同じサーバー内で同時に何度も取りに行かないようにする
let inflight: Promise<unknown> | null = null;

/** 最後の取得から STALE_HOURS 以上たっていれば取り直す（失敗しても画面は壊さない） */
export async function ensureFreshNews(): Promise<void> {
  try {
    const last = await lastNewsFetch();
    if (last && Date.now() - Date.parse(last) < STALE_HOURS * 3_600_000) return;
    inflight ??= refreshNews().finally(() => {
      inflight = null;
    });
    await inflight;
  } catch (e) {
    console.error("[news] 更新に失敗", e);
  }
}
