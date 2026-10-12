import { describe, expect, it } from "vitest";
import { cadSeries, fxOnOrBefore, latestCadQuote, unrealizedPct, valuePortfolio } from "./portfolio";
import type { Position } from "./acb";

describe("cadSeries / latestCadQuote", () => {
  const prices = [
    { date: "2026-10-09", close: 82_966, currency: "USD" },
    { date: "2026-10-09", close: 118_202, currency: "CAD" },
    { date: "2026-10-12", close: 83_854, currency: "USD" },
    { date: "2026-10-12", close: 119_467, currency: "CAD" },
  ];

  it("CAD 建ての終値を優先する", () => {
    const q = latestCadQuote(prices, {})!;
    expect(q.price).toBe(119_467);
    expect(q.prevPrice).toBe(118_202);
    expect(q.date).toBe("2026-10-12");
    expect(q.converted).toBe(false);
  });

  it("CAD がなければ、その日以前で最新の FX レートで換算する", () => {
    const s = cadSeries(
      [
        { date: "2026-10-09", close: 100, currency: "USD" },
        { date: "2026-10-12", close: 110, currency: "USD" },
      ],
      { USD: [{ date: "2026-10-08", rate: 1.3 }, { date: "2026-10-10", rate: 1.4 }] },
    );
    expect(s[0].close).toBeCloseTo(130);
    expect(s[1].close).toBeCloseTo(154);
    expect(s[1].converted).toBe(true);
  });

  it("FX が取得前の日付なら最も古いレートで補う", () => {
    expect(fxOnOrBefore([{ date: "2026-10-10", rate: 1.4 }], "2026-01-01")?.rate).toBe(1.4);
    expect(fxOnOrBefore([], "2026-01-01")).toBeNull();
  });
});

describe("valuePortfolio（含み損益: 資産・口座・全体）", () => {
  const positions: Position[] = [
    { accountId: "kraken", assetId: "btc", quantity: 0.01, acb: 1000, realizedGain: 0, dividends: 0 },
    { accountId: "tfsa", assetId: "vfv", quantity: 10, acb: 1200, realizedGain: 0, dividends: 0 },
    { accountId: "ws", assetId: "vfv", quantity: 5, acb: 500, realizedGain: 0, dividends: 0 },
    { accountId: "ws", assetId: "xyz", quantity: 1, acb: 50, realizedGain: 0, dividends: 0 },
    { accountId: "ws", assetId: "old", quantity: 0, acb: 0, realizedGain: 10, dividends: 0 },
  ];
  const quotes = {
    btc: { price: 120_000, date: "d", prevPrice: 118_000, prevDate: "p", converted: false },
    vfv: { price: 130, date: "d", prevPrice: null, prevDate: null, converted: false },
    xyz: null,
  };
  const v = valuePortfolio(positions, quotes);

  it("資産ごと", () => {
    expect(v.byAsset.btc.marketValue).toBeCloseTo(1200);
    expect(v.byAsset.btc.unrealized).toBeCloseTo(200);
    expect(v.byAsset.btc.dayChange).toBeCloseTo(20);
    expect(v.byAsset.vfv.quantity).toBeCloseTo(15);
    expect(v.byAsset.vfv.marketValue).toBeCloseTo(1950);
    expect(v.byAsset.vfv.unrealized).toBeCloseTo(250);
  });

  it("口座ごと（価格のない資産は評価から外して unpricedAcb に入れる）", () => {
    expect(v.byAccount.ws.marketValue).toBeCloseTo(650);
    expect(v.byAccount.ws.unrealized).toBeCloseTo(150);
    expect(v.byAccount.ws.unpricedAcb).toBeCloseTo(50);
    expect(v.byAccount.tfsa.unrealized).toBeCloseTo(100);
  });

  it("全体", () => {
    expect(v.total.marketValue).toBeCloseTo(3150);
    expect(v.total.unrealized).toBeCloseTo(450);
    expect(v.total.acb).toBeCloseTo(2750);
    expect(unrealizedPct(v.total)).toBeCloseTo((450 / 2700) * 100);
  });

  it("数量 0 のポジションは保有に含めない", () => {
    expect(v.holdings.find((h) => h.assetId === "old")).toBeUndefined();
  });
});
