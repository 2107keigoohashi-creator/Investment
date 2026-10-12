import { describe, expect, it } from "vitest";
import { computeTransactionAmounts, derivePriceFromProceeds, derivePriceFromTotal, toCad } from "./transaction";

describe("computeTransactionAmounts", () => {
  it("買い: 支払総額 = 数量×単価+手数料、CAD 換算", () => {
    const r = computeTransactionAmounts({ type: "buy", quantity: 0.002, price: 119_467, fee: 1.5, fxRate: 1 });
    expect(r.amount).toBeCloseTo(240.434, 6);
    expect(r.amountCad).toBeCloseTo(240.434, 6);
    expect(r.feeCad).toBeCloseTo(1.5);
  });

  it("売り: 受取額 = 数量×単価−手数料", () => {
    const r = computeTransactionAmounts({ type: "sell", quantity: 10, price: 220, fee: 1, fxRate: 1.4 });
    expect(r.amount).toBeCloseTo(2199);
    expect(r.amountCad).toBeCloseTo(3078.6);
    expect(r.feeCad).toBeCloseTo(1.4);
  });

  it("入金は金額をそのまま使う", () => {
    const r = computeTransactionAmounts({ type: "deposit", quantity: 0, price: 0, fee: 0, fxRate: 1.38, amount: 100 });
    expect(r.amountCad).toBeCloseTo(138);
  });

  it("toCad", () => {
    expect(toCad(100, 1.3712)).toBeCloseTo(137.12);
  });
});

describe("derivePriceFromTotal（数量＋支払額 → 単価）", () => {
  it("手数料なし", () => {
    expect(derivePriceFromTotal(0.001, 119.467)).toBeCloseTo(119_467, 6);
  });
  it("手数料込みの支払額から手数料を引いて単価を出す", () => {
    expect(derivePriceFromTotal(0.002, 240.434, 1.5)).toBeCloseTo(119_467, 6);
  });
  it("不正な入力は null", () => {
    expect(derivePriceFromTotal(0, 100)).toBeNull();
    expect(derivePriceFromTotal(1, 0)).toBeNull();
    expect(derivePriceFromTotal(1, 5, 10)).toBeNull();
  });
});

describe("derivePriceFromProceeds（数量＋受取額 → 単価）", () => {
  it("受取額に手数料を足して単価を出す", () => {
    expect(derivePriceFromProceeds(10, 2199, 1)).toBeCloseTo(220);
  });
  it("往復で computeTransactionAmounts と一致する", () => {
    const price = derivePriceFromProceeds(0.5, 145, 5)!;
    expect(computeTransactionAmounts({ type: "sell", quantity: 0.5, price, fee: 5, fxRate: 1 }).amount).toBeCloseTo(145);
  });
});
