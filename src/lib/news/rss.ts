// RSS（Google ニュース）の簡易パーサー。依存を増やさないよう正規表現で読む

export interface RssItem {
  title: string;
  url: string;
  source: string | null;
  publishedAt: string | null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .trim();
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decodeEntities(m[1]) : null;
}

export function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  for (const m of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const block = m[1];
    const url = tag(block, "link");
    let title = tag(block, "title");
    if (!url || !title || !/^https?:\/\//.test(url)) continue;
    const source = tag(block, "source");
    // Google ニュースのタイトルは「見出し - 媒体名」なので媒体名を外す
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3)).trim();
    const pub = tag(block, "pubDate");
    const t = pub ? Date.parse(pub) : NaN;
    items.push({ title, url, source, publishedAt: Number.isFinite(t) ? new Date(t).toISOString() : null });
  }
  return items;
}
