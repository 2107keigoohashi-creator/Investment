import { describe, expect, it } from "vitest";
import { parseChartHistory, parseChartQuote, parseSearch, yahooSymbolFor } from "./yahoo";
import { parseRss } from "../news/rss";

const chart = {
  chart: {
    result: [
      {
        meta: {
          symbol: "VFV.TO",
          currency: "CAD",
          exchangeTimezoneName: "America/Toronto",
          regularMarketPrice: 152.3,
          regularMarketTime: Date.UTC(2026, 9, 9, 20, 0) / 1000,
          chartPreviousClose: 150,
          longName: "Vanguard S&P 500 Index ETF",
        },
        timestamp: [Date.UTC(2026, 9, 8, 13, 30) / 1000, Date.UTC(2026, 9, 9, 13, 30) / 1000, Date.UTC(2026, 9, 10, 13, 30) / 1000],
        indicators: { quote: [{ close: [150, 152.3, null] }] },
      },
    ],
    error: null,
  },
};

describe("Yahoo Finance パーサー", () => {
  it("最新値と前日終値", () => {
    expect(parseChartQuote(chart)).toMatchObject({
      symbol: "VFV.TO",
      price: 152.3,
      previousClose: 150,
      currency: "CAD",
      date: "2026-10-09",
      name: "Vanguard S&P 500 Index ETF",
    });
  });

  it("日足（null は飛ばす）", () => {
    expect(parseChartHistory(chart)).toEqual([
      { date: "2026-10-08", close: 150, currency: "CAD" },
      { date: "2026-10-09", close: 152.3, currency: "CAD" },
    ]);
  });

  it("エラー応答は null / 空", () => {
    const err = { chart: { result: null, error: { code: "Not Found" } } };
    expect(parseChartQuote(err)).toBeNull();
    expect(parseChartHistory(err)).toEqual([]);
  });

  it("検索結果から株・ETF・暗号資産だけを残す", () => {
    expect(
      parseSearch({
        quotes: [
          { symbol: "SHOP.TO", longname: "Shopify Inc.", exchDisp: "Toronto", quoteType: "EQUITY" },
          { symbol: "IBIT", shortname: "iShares Bitcoin Trust", exchDisp: "NASDAQ", quoteType: "ETF" },
          { symbol: "^GSPC", shortname: "S&P 500", quoteType: "INDEX" },
        ],
      }),
    ).toEqual([
      { symbol: "SHOP.TO", name: "Shopify Inc.", exchange: "Toronto", type: "stock" },
      { symbol: "IBIT", name: "iShares Bitcoin Trust", exchange: "NASDAQ", type: "etf" },
    ]);
  });

  it("暗号資産は BTC-CAD で引く", () => {
    expect(yahooSymbolFor({ symbol: "BTC", source_id: "bitcoin", price_source: "coingecko", asset_type: "crypto" })).toBe("BTC-CAD");
    expect(yahooSymbolFor({ symbol: "VFV.TO", source_id: "VFV.TO", price_source: "yahoo", asset_type: "etf" })).toBe("VFV.TO");
  });
});

describe("Google ニュース RSS", () => {
  it("タイトルから媒体名を外し、実体参照を戻す", () => {
    const xml = `<?xml version="1.0"?><rss><channel><title>x</title>
      <item><title>ビットコイン、&quot;9万ドル&quot;に迫る - 日本経済新聞</title>
        <link>https://news.google.com/rss/articles/abc?oc=5</link>
        <pubDate>Mon, 12 Oct 2026 13:00:00 GMT</pubDate>
        <source url="https://www.nikkei.com">日本経済新聞</source></item>
      <item><title><![CDATA[TSX closes higher & oil gains]]></title><link>https://news.google.com/rss/articles/def</link></item>
      <item><title>壊れた行</title><link>javascript:alert(1)</link></item>
    </channel></rss>`;
    expect(parseRss(xml)).toEqual([
      { title: 'ビットコイン、"9万ドル"に迫る', url: "https://news.google.com/rss/articles/abc?oc=5", source: "日本経済新聞", publishedAt: "2026-10-12T13:00:00.000Z" },
      { title: "TSX closes higher & oil gains", url: "https://news.google.com/rss/articles/def", source: null, publishedAt: null },
    ]);
  });
});
