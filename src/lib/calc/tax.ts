import type { LedgerTransaction, RealizedEvent } from "./acb";
import { addDays } from "./dates";

/**
 * 課税口座の年ごとの譲渡益集計（申告の参考用。正式な税務計算ではない）。
 * カナダでは譲渡益の 50% が課税所得に算入される（inclusion rate）。
 */

export const CAPITAL_GAINS_INCLUSION_RATE = 0.5;

export interface YearlyGains {
  year: number;
  proceeds: number;
  costBase: number;
  gains: number;
  losses: number;
  net: number;
  taxableCapitalGain: number;
  events: RealizedEvent[];
}

export function yearlyCapitalGains(realized: RealizedEvent[]): YearlyGains[] {
  const byYear = new Map<number, YearlyGains>();
  for (const e of realized) {
    if (!e.taxable) continue;
    let y = byYear.get(e.year);
    if (!y) {
      y = { year: e.year, proceeds: 0, costBase: 0, gains: 0, losses: 0, net: 0, taxableCapitalGain: 0, events: [] };
      byYear.set(e.year, y);
    }
    y.proceeds += e.proceeds;
    y.costBase += e.costBase;
    if (e.gain >= 0) y.gains += e.gain;
    else y.losses += e.gain;
    y.net += e.gain;
    y.events.push(e);
  }
  for (const y of byYear.values()) {
    y.taxableCapitalGain = Math.max(0, y.net) * CAPITAL_GAINS_INCLUSION_RATE;
  }
  return [...byYear.values()].sort((a, b) => b.year - a.year);
}

export interface SuperficialLossWarning {
  transactionId: string;
  date: string;
  assetId: string;
  loss: number;
  /** 前後 30 日以内の買い付けの取引 ID */
  repurchaseIds: string[];
  /** 売却日から 30 日後の時点の保有数量（全口座合計） */
  quantityHeldAfter30Days: number;
}

/**
 * 30 日ルール（superficial loss rule）に当たりそうな売却を探す。
 * 条件: 課税口座での損失の売却で、売却日の前後 30 日以内に同じ資産を（どの口座でも）買い、
 * かつ 30 日後の時点でまだ保有している。TFSA / RRSP での買い直しも対象になる点に注意。
 * 警告のためのもので、判定は簡易的。
 */
export function findSuperficialLosses(
  realized: RealizedEvent[],
  transactions: LedgerTransaction[],
): SuperficialLossWarning[] {
  const warnings: SuperficialLossWarning[] = [];
  for (const e of realized) {
    if (!e.taxable || e.gain >= 0 || e.kind !== "sell") continue;
    const from = addDays(e.date, -30);
    const to = addDays(e.date, 30);
    const repurchases = transactions.filter(
      (t) =>
        t.asset_id === e.assetId &&
        t.id !== e.transactionId &&
        t.trade_date >= from &&
        t.trade_date <= to &&
        t.type === "buy",
    );
    if (repurchases.length === 0) continue;
    const held = quantityHeldOn(transactions, e.assetId, to);
    if (held <= 1e-12) continue;
    warnings.push({
      transactionId: e.transactionId,
      date: e.date,
      assetId: e.assetId,
      loss: e.gain,
      repurchaseIds: repurchases.map((t) => t.id),
      quantityHeldAfter30Days: held,
    });
  }
  return warnings;
}

/** ある日の終わり時点の、全口座合計の保有数量 */
export function quantityHeldOn(transactions: LedgerTransaction[], assetId: string, date: string): number {
  let q = 0;
  for (const t of transactions) {
    if (t.asset_id !== assetId || t.trade_date > date) continue;
    if (t.type === "buy") q += t.quantity;
    else if (t.type === "sell") q -= t.quantity;
    else if (t.type === "fee" && t.quantity > 0) q -= t.quantity;
    // transfer は口座間の移動なので全口座合計は変わらない
  }
  return Math.max(0, q);
}
