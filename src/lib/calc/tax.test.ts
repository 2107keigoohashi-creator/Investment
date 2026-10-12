import { describe, expect, it } from "vitest";
import { computeLedger, type LedgerTransaction } from "./acb";
import { findSuperficialLosses, yearlyCapitalGains } from "./tax";

const accounts = [
  { id: "ws", account_type: "non_registered" as const },
  { id: "tfsa", account_type: "tfsa" as const },
];

function t(id: string, p: Partial<LedgerTransaction> & Pick<LedgerTransaction, "type" | "trade_date">): LedgerTransaction {
  const quantity = p.quantity ?? 0;
  const price = p.price ?? 0;
  return {
    id,
    account_id: "ws",
    asset_id: "a",
    quantity,
    price,
    fee: 0,
    fx_rate: 1,
    amount_cad: quantity * price,
    fee_cad: 0,
    transfer_account_id: null,
    ...p,
  };
}

describe("yearlyCapitalGains", () => {
  it("課税口座の損益だけを年ごとに集計し、50% を課税所得に算入する", () => {
    const txs = [
      t("1", { type: "buy", trade_date: "2025-01-01", quantity: 2, price: 100 }),
      t("2", { type: "sell", trade_date: "2025-06-01", quantity: 1, price: 300 }),
      t("3", { type: "sell", trade_date: "2026-02-01", quantity: 1, price: 50 }),
      t("4", { type: "buy", trade_date: "2025-01-01", account_id: "tfsa", quantity: 1, price: 10 }),
      t("5", { type: "sell", trade_date: "2025-03-01", account_id: "tfsa", quantity: 1, price: 1000 }),
    ];
    const ledger = computeLedger(txs, accounts);
    const years = yearlyCapitalGains(ledger.realized);
    expect(years.map((y) => y.year)).toEqual([2026, 2025]);
    const y2025 = years.find((y) => y.year === 2025)!;
    expect(y2025.net).toBeCloseTo(200);
    expect(y2025.taxableCapitalGain).toBeCloseTo(100);
    expect(y2025.events).toHaveLength(1);
    const y2026 = years.find((y) => y.year === 2026)!;
    expect(y2026.net).toBeCloseTo(-50);
    expect(y2026.losses).toBeCloseTo(-50);
    expect(y2026.taxableCapitalGain).toBe(0);
  });
});

describe("findSuperficialLosses（30日ルール）", () => {
  it("損失売却の前後 30 日以内に買い直し、30 日後も保有していれば警告", () => {
    const txs = [
      t("1", { type: "buy", trade_date: "2026-01-01", quantity: 1, price: 100 }),
      t("2", { type: "sell", trade_date: "2026-03-01", quantity: 1, price: 60 }),
      t("3", { type: "buy", trade_date: "2026-03-20", quantity: 1, price: 65 }),
    ];
    const ledger = computeLedger(txs, accounts);
    const w = findSuperficialLosses(ledger.realized, txs);
    expect(w).toHaveLength(1);
    expect(w[0].transactionId).toBe("2");
    expect(w[0].repurchaseIds).toEqual(["3"]);
  });

  it("TFSA での買い直しも対象", () => {
    const txs = [
      t("1", { type: "buy", trade_date: "2026-01-01", quantity: 1, price: 100 }),
      t("2", { type: "sell", trade_date: "2026-03-01", quantity: 1, price: 60 }),
      t("3", { type: "buy", trade_date: "2026-02-20", account_id: "tfsa", quantity: 1, price: 65 }),
    ];
    const w = findSuperficialLosses(computeLedger(txs, accounts).realized, txs);
    expect(w).toHaveLength(1);
  });

  it("31 日以上あいていれば警告しない", () => {
    const txs = [
      t("1", { type: "buy", trade_date: "2026-01-01", quantity: 1, price: 100 }),
      t("2", { type: "sell", trade_date: "2026-03-01", quantity: 1, price: 60 }),
      t("3", { type: "buy", trade_date: "2026-04-01", quantity: 1, price: 65 }),
    ];
    expect(findSuperficialLosses(computeLedger(txs, accounts).realized, txs)).toHaveLength(0);
  });

  it("30 日後に保有していなければ警告しない", () => {
    const txs = [
      t("1", { type: "buy", trade_date: "2026-01-01", quantity: 1, price: 100 }),
      t("2", { type: "sell", trade_date: "2026-03-01", quantity: 1, price: 60 }),
      t("3", { type: "buy", trade_date: "2026-03-05", quantity: 1, price: 65 }),
      t("4", { type: "sell", trade_date: "2026-03-10", quantity: 1, price: 70 }),
    ];
    expect(findSuperficialLosses(computeLedger(txs, accounts).realized, txs)).toHaveLength(0);
  });

  it("利益の売却は対象外", () => {
    const txs = [
      t("1", { type: "buy", trade_date: "2026-01-01", quantity: 1, price: 100 }),
      t("2", { type: "sell", trade_date: "2026-03-01", quantity: 1, price: 160 }),
      t("3", { type: "buy", trade_date: "2026-03-05", quantity: 1, price: 165 }),
    ];
    expect(findSuperficialLosses(computeLedger(txs, accounts).realized, txs)).toHaveLength(0);
  });
});
