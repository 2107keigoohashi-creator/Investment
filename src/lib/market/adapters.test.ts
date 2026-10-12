import { afterEach, describe, expect, it, vi } from "vitest";
import { alphavantage } from "./alphavantage";
import { coingecko } from "./coingecko";
import { fetchFearGreed } from "./feargreed";
import { finnhub } from "./finnhub";
import { fetchBocFx } from "./fx";

function mockFetch(body: unknown, status = 200) {
  const fn = vi.fn(async (_input: string) => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const btc = { id: "a1", symbol: "BTC", source_id: "bitcoin", currency: "CAD" };

describe("CoinGecko", () => {
  it("CAD と USD の両方を返す", async () => {
    const f = mockFetch({ bitcoin: { cad: 119467, usd: 83854 } });
    const q = await coingecko.fetchLatest([btc], "2026-10-12");
    expect(String(f.mock.calls[0][0])).toContain("ids=bitcoin");
    expect(q).toEqual([
      { assetId: "a1", date: "2026-10-12", close: 119467, currency: "CAD", source: "coingecko" },
      { assetId: "a1", date: "2026-10-12", close: 83854, currency: "USD", source: "coingecko" },
    ]);
  });

  it("履歴は日付ごとに 1 件（同じ日は最後の値）", async () => {
    mockFetch({ prices: [[Date.UTC(2026, 9, 10), 1], [Date.UTC(2026, 9, 11), 2], [Date.UTC(2026, 9, 11, 12), 3]] });
    const q = await coingecko.fetchHistory!(btc, 3);
    const cad = q.filter((x) => x.currency === "CAD");
    expect(cad.map((x) => [x.date, x.close])).toEqual([["2026-10-10", 1], ["2026-10-11", 3]]);
  });

  it("HTTP エラーは例外にする（呼び出し側で「◯日前の値」にフォールバック）", async () => {
    mockFetch({ error: "rate limited" }, 429);
    await expect(coingecko.fetchLatest([btc], "2026-10-12")).rejects.toThrow("429");
  });
});

describe("Bank of Canada Valet", () => {
  it("FXUSDCAD を読む", async () => {
    mockFetch({ observations: [{ d: "2026-10-09", FXUSDCAD: { v: "1.3712" } }, { d: "2026-10-10", FXUSDCAD: { v: "" } }] });
    expect(await fetchBocFx("USD")).toEqual([
      { date: "2026-10-09", base: "USD", quote: "CAD", rate: 1.3712, source: "bank_of_canada" },
    ]);
  });
});

describe("alternative.me Fear & Greed", () => {
  it("値と分類を読む", async () => {
    mockFetch({ data: [{ value: "69", value_classification: "Greed", timestamp: String(Date.UTC(2026, 9, 12) / 1000) }] });
    expect(await fetchFearGreed()).toEqual([{ date: "2026-10-12", value: 69, label: "Greed" }]);
  });
});

describe("株価 adapter", () => {
  const vfv = { id: "v1", symbol: "VFV.TO", source_id: null, currency: "CAD" };

  it("Finnhub /quote", async () => {
    vi.stubEnv("FINNHUB_API_KEY", "k");
    mockFetch({ c: 152.3, t: Date.UTC(2026, 9, 9, 20) / 1000 });
    const q = await finnhub.fetchLatest([vfv], "2026-10-12");
    expect(q[0]).toMatchObject({ assetId: "v1", close: 152.3, currency: "CAD", date: "2026-10-09" });
  });

  it("Alpha Vantage はレート制限のメッセージを例外にする", async () => {
    vi.stubEnv("ALPHAVANTAGE_API_KEY", "k");
    mockFetch({ Information: "rate limit" });
    await expect(alphavantage.fetchLatest([vfv], "2026-10-12")).rejects.toThrow("rate limit");
  });

  it("Alpha Vantage GLOBAL_QUOTE", async () => {
    vi.stubEnv("ALPHAVANTAGE_API_KEY", "k");
    mockFetch({ "Global Quote": { "05. price": "152.30", "07. latest trading day": "2026-10-09" } });
    expect(await alphavantage.fetchLatest([vfv], "2026-10-12")).toEqual([
      { assetId: "v1", date: "2026-10-09", close: 152.3, currency: "CAD", source: "alphavantage" },
    ]);
  });
});
