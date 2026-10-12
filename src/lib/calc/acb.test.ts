import { describe, expect, it } from "vitest";
import { averageCost, averageCostHistory, computeLedger, type LedgerTransaction } from "./acb";
import { computeTransactionAmounts } from "./transaction";
import type { TransactionType } from "../types";

const accounts = [
  { id: "kraken", account_type: "exchange" as const },
  { id: "ws", account_type: "non_registered" as const },
  { id: "tfsa", account_type: "tfsa" as const },
  { id: "rrsp", account_type: "rrsp" as const },
];

let seq = 0;
function tx(
  partial: Partial<LedgerTransaction> & { type: TransactionType; trade_date: string },
): LedgerTransaction {
  const base = {
    id: `t${++seq}`,
    account_id: "kraken",
    asset_id: "btc",
    quantity: 0,
    price: 0,
    fee: 0,
    fx_rate: 1,
    transfer_account_id: null,
    ...partial,
  };
  const amounts = computeTransactionAmounts({
    type: base.type,
    quantity: base.quantity,
    price: base.price,
    fee: base.fee,
    fxRate: base.fx_rate,
    amount: (partial as { amount?: number }).amount,
  });
  return {
    amount_cad: amounts.amountCad,
    fee_cad: amounts.feeCad,
    ...base,
  };
}

describe("computeLedger / ACB 平均法", () => {
  it("買いの ACB は 数量×単価+手数料、平均取得単価はその平均", () => {
    const l = computeLedger(
      [
        tx({ type: "buy", trade_date: "2026-01-01", quantity: 0.01, price: 100_000, fee: 10 }),
        tx({ type: "buy", trade_date: "2026-02-01", quantity: 0.01, price: 120_000, fee: 10 }),
      ],
      accounts,
    );
    const p = l.positions[0];
    expect(p.quantity).toBeCloseTo(0.02, 12);
    expect(p.acb).toBeCloseTo(1000 + 10 + 1200 + 10, 8);
    expect(averageCost(p)).toBeCloseTo(111_000, 6);
    expect(l.feesTotal).toBeCloseTo(20, 8);
  });

  it("売却は平均 ACB を基準に実現損益を出し、残りの平均単価は変わらない", () => {
    const l = computeLedger(
      [
        tx({ type: "buy", trade_date: "2026-01-01", quantity: 1, price: 100 }),
        tx({ type: "buy", trade_date: "2026-01-02", quantity: 1, price: 200 }),
        tx({ type: "sell", trade_date: "2026-01-03", quantity: 0.5, price: 300, fee: 5 }),
      ],
      accounts,
    );
    const p = l.positions[0];
    // ACB 300 / 2 = 150。0.5 売却 → 原価 75、受取 150-5=145、利益 70
    expect(l.realized).toHaveLength(1);
    expect(l.realized[0].proceeds).toBeCloseTo(145);
    expect(l.realized[0].costBase).toBeCloseTo(75);
    expect(l.realized[0].gain).toBeCloseTo(70);
    expect(l.realized[0].taxable).toBe(true);
    expect(p.quantity).toBeCloseTo(1.5);
    expect(p.acb).toBeCloseTo(225);
    expect(averageCost(p)).toBeCloseTo(150);
  });

  it("全量売却で ACB は 0 に戻り、その後の買いは新しい平均になる", () => {
    const l = computeLedger(
      [
        tx({ type: "buy", trade_date: "2026-01-01", quantity: 2, price: 100 }),
        tx({ type: "sell", trade_date: "2026-01-02", quantity: 2, price: 50 }),
        tx({ type: "buy", trade_date: "2026-01-03", quantity: 1, price: 80 }),
      ],
      accounts,
    );
    expect(l.realized[0].gain).toBeCloseTo(-100);
    expect(l.positions[0].acb).toBeCloseTo(80);
    expect(averageCost(l.positions[0])).toBeCloseTo(80);
  });

  it("USD 建ての取引は取引日の FX レートで CAD 換算する", () => {
    const l = computeLedger(
      [
        tx({ type: "buy", trade_date: "2026-01-01", asset_id: "aapl", quantity: 10, price: 200, fee: 1, fx_rate: 1.35 }),
        tx({ type: "sell", trade_date: "2026-06-01", asset_id: "aapl", quantity: 10, price: 220, fee: 1, fx_rate: 1.4 }),
      ],
      accounts,
    );
    // 取得: (2000+1)×1.35 = 2701.35、売却: (2200−1)×1.40 = 3078.6
    expect(l.realized[0].costBase).toBeCloseTo(2701.35, 6);
    expect(l.realized[0].proceeds).toBeCloseTo(3078.6, 6);
    expect(l.realized[0].gain).toBeCloseTo(377.25, 6);
  });

  it("課税口座は複数口座をまとめた ACB プールで損益を出す", () => {
    const l = computeLedger(
      [
        tx({ type: "buy", trade_date: "2026-01-01", account_id: "kraken", quantity: 1, price: 100 }),
        tx({ type: "buy", trade_date: "2026-01-02", account_id: "ws", quantity: 1, price: 300 }),
        tx({ type: "sell", trade_date: "2026-01-03", account_id: "kraken", quantity: 1, price: 250 }),
      ],
      accounts,
    );
    // プール ACB 平均 200 → 利益 50（口座単体の平均 100 ではない）
    expect(l.realized[0].costBase).toBeCloseTo(200);
    expect(l.realized[0].gain).toBeCloseTo(50);
    const pool = l.taxPools.find((p) => p.assetId === "btc")!;
    expect(pool.quantity).toBeCloseTo(1);
    expect(pool.acb).toBeCloseTo(200);
  });

  it("TFSA/RRSP の売却は課税対象外で、税務プールに影響しない", () => {
    const l = computeLedger(
      [
        tx({ type: "buy", trade_date: "2026-01-01", account_id: "tfsa", asset_id: "vfv", quantity: 10, price: 100 }),
        tx({ type: "buy", trade_date: "2026-01-01", account_id: "ws", asset_id: "vfv", quantity: 10, price: 50 }),
        tx({ type: "sell", trade_date: "2026-03-01", account_id: "tfsa", asset_id: "vfv", quantity: 5, price: 150 }),
      ],
      accounts,
    );
    const e = l.realized[0];
    expect(e.taxable).toBe(false);
    expect(e.costBase).toBeCloseTo(500);
    expect(e.gain).toBeCloseTo(250);
    const pool = l.taxPools.find((p) => p.assetId === "vfv")!;
    expect(pool.quantity).toBeCloseTo(10);
    expect(pool.acb).toBeCloseTo(500);
  });

  it("保有より多い売却は警告を出し、数量は 0 で止まる", () => {
    const l = computeLedger(
      [
        tx({ type: "buy", trade_date: "2026-01-01", quantity: 1, price: 100 }),
        tx({ type: "sell", trade_date: "2026-01-02", quantity: 2, price: 100 }),
      ],
      accounts,
    );
    expect(l.warnings.map((w) => w.code)).toContain("oversell");
    expect(l.positions[0].quantity).toBe(0);
  });

  it("同じ日の取引は登録順で処理する", () => {
    const l = computeLedger(
      [
        tx({ type: "sell", trade_date: "2026-01-01", quantity: 1, price: 150, created_at: "2026-01-01T10:00:00Z" }),
        tx({ type: "buy", trade_date: "2026-01-01", quantity: 1, price: 100, created_at: "2026-01-01T09:00:00Z" }),
      ],
      accounts,
    );
    expect(l.warnings).toHaveLength(0);
    expect(l.realized[0].gain).toBeCloseTo(50);
  });

  it("課税口座同士の移動は処分ではなく、ACB をそのまま移す", () => {
    const l = computeLedger(
      [
        tx({ type: "buy", trade_date: "2026-01-01", account_id: "kraken", quantity: 1, price: 100 }),
        tx({ type: "transfer", trade_date: "2026-01-02", account_id: "kraken", transfer_account_id: "ws", quantity: 0.4 }),
      ],
      accounts,
    );
    expect(l.realized).toHaveLength(0);
    const ws = l.positions.find((p) => p.accountId === "ws")!;
    const kr = l.positions.find((p) => p.accountId === "kraken")!;
    expect(ws.acb).toBeCloseTo(40);
    expect(kr.acb).toBeCloseTo(60);
    expect(l.taxPools[0].quantity).toBeCloseTo(1);
  });

  it("課税口座 → TFSA の移動は時価でのみなし譲渡になる", () => {
    const l = computeLedger(
      [
        tx({ type: "buy", trade_date: "2026-01-01", account_id: "ws", quantity: 1, price: 100 }),
        tx({ type: "transfer", trade_date: "2026-02-01", account_id: "ws", transfer_account_id: "tfsa", quantity: 1, price: 130 }),
      ],
      accounts,
    );
    expect(l.realized[0].kind).toBe("deemed_disposition");
    expect(l.realized[0].gain).toBeCloseTo(30);
    expect(l.realized[0].taxable).toBe(true);
    const tfsa = l.positions.find((p) => p.accountId === "tfsa")!;
    expect(tfsa.acb).toBeCloseTo(130);
  });

  it("課税口座と登録口座の間の移動で時価がなければ警告", () => {
    const l = computeLedger(
      [
        tx({ type: "buy", trade_date: "2026-01-01", account_id: "ws", quantity: 1, price: 100 }),
        tx({ type: "transfer", trade_date: "2026-02-01", account_id: "ws", transfer_account_id: "rrsp", quantity: 1 }),
      ],
      accounts,
    );
    expect(l.warnings.map((w) => w.code)).toContain("missing_fmv");
  });

  it("数量で払う手数料は保有数量を減らし、ACB は残す", () => {
    const l = computeLedger(
      [
        tx({ type: "buy", trade_date: "2026-01-01", quantity: 1, price: 100 }),
        tx({ type: "fee", trade_date: "2026-01-02", quantity: 0.1, fee: 10 }),
      ],
      accounts,
    );
    const p = l.positions[0];
    expect(p.quantity).toBeCloseTo(0.9);
    expect(p.acb).toBeCloseTo(100);
    expect(averageCost(p)).toBeCloseTo(111.111111, 4);
  });

  it("入出金・配当を集計する", () => {
    const l = computeLedger(
      [
        tx({ type: "deposit", trade_date: "2026-01-01", asset_id: null, amount: 1000 } as never),
        tx({ type: "withdraw", trade_date: "2026-01-02", asset_id: null, amount: 200 } as never),
        tx({ type: "dividend", trade_date: "2026-01-03", asset_id: "vfv", amount: 12, fx_rate: 1 } as never),
      ],
      accounts,
    );
    expect(l.netContributions).toBeCloseTo(800);
    expect(l.dividendsTotal).toBeCloseTo(12);
  });
});

describe("averageCostHistory", () => {
  it("取引日ごとの平均取得単価", () => {
    const h = averageCostHistory(
      [
        tx({ type: "buy", trade_date: "2026-01-01", quantity: 1, price: 100 }),
        tx({ type: "buy", trade_date: "2026-01-05", quantity: 1, price: 200 }),
        tx({ type: "sell", trade_date: "2026-01-09", quantity: 2, price: 300 }),
      ],
      accounts,
      "btc",
    );
    expect(h).toEqual([
      { date: "2026-01-01", avgCost: 100 },
      { date: "2026-01-05", avgCost: 150 },
      { date: "2026-01-09", avgCost: null },
    ]);
  });
});
