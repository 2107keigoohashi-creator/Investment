import { describe, expect, it } from "vitest";
import { backtest, cagrPct, downsample, projectFuture } from "./simulate";

const prices = [
  { date: "2026-01-01", close: 100 },
  { date: "2026-01-02", close: 100 },
  { date: "2026-02-02", close: 50 }, // 2/1 は日曜で価格なし → 2/2 に買う
  { date: "2026-03-02", close: 100 },
  { date: "2026-03-15", close: 120 },
];

describe("backtest", () => {
  it("毎月積立: 価格がない日は次の取引日に買う", () => {
    const r = backtest({ prices, mode: "dca", amount: 100, frequency: "monthly", dayOfMonth: 1, start: "2026-01-01", end: "2026-03-15" })!;
    expect(r.purchases).toBe(3);
    expect(r.invested).toBe(300);
    expect(r.units).toBeCloseTo(1 + 2 + 1);
    expect(r.value).toBeCloseTo(480);
    expect(r.gainPct).toBeCloseTo(60);
    expect(r.avgCost).toBeCloseTo(75);
    expect(r.points.at(-1)).toEqual({ date: "2026-03-15", invested: 300, value: 480 });
  });

  it("一括: 最初の日に全額", () => {
    const r = backtest({ prices, mode: "lump", amount: 300, frequency: "monthly", start: "2026-01-01", end: "2026-03-15" })!;
    expect(r.purchases).toBe(1);
    expect(r.units).toBeCloseTo(3);
    expect(r.value).toBeCloseTo(360);
    // 300 → 150（2/2）で 50% 下落
    expect(r.maxDrawdownPct).toBeCloseTo(50);
  });

  it("期間に価格がなければ null", () => {
    expect(backtest({ prices, mode: "dca", amount: 100, frequency: "monthly", start: "2027-01-01", end: "2027-02-01" })).toBeNull();
  });
});

describe("projectFuture", () => {
  it("年利 0% なら積立額の合計", () => {
    const p = projectFuture({ initial: 1000, monthly: 100, annualRatePct: 0, years: 2 });
    expect(p.map((x) => x.year)).toEqual([0, 1, 2]);
    expect(p.at(-1)!.value).toBeCloseTo(3400);
    expect(p.at(-1)!.contributed).toBeCloseTo(3400);
  });

  it("年利 10% の一括は 1 年で 1.1 倍", () => {
    const p = projectFuture({ initial: 1000, monthly: 0, annualRatePct: 10, years: 1 });
    expect(p.at(-1)!.value).toBeCloseTo(1100, 6);
  });
});

describe("cagrPct / downsample", () => {
  it("2 年で 100 → 121 は年率 10%", () => {
    expect(cagrPct([{ date: "2024-01-01", close: 100 }, { date: "2026-01-01", close: 121 }])).toBeCloseTo(10, 1);
  });
  it("間引いても最後の点は残る", () => {
    const xs = Array.from({ length: 1000 }, (_, i) => i);
    const d = downsample(xs, 100);
    expect(d.length).toBeLessThanOrEqual(101);
    expect(d.at(-1)).toBe(999);
  });
});
