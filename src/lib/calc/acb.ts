import { isTaxableAccount, type AccountType, type TransactionType } from "../types";

/**
 * ACB（Adjusted Cost Base, 平均法）の計算。
 *
 * - 口座 × 資産ごとの「ポジション」（表示用の平均取得単価・含み損益の基準）
 * - 課税口座（non_registered / exchange）をまとめた資産ごとの「税務プール」
 *   … カナダでは同一銘柄の ACB は課税口座全体で 1 つにまとめて計算する
 * - TFSA / RRSP / FHSA の売却は損益を出すが、譲渡益（taxable）からは外す
 *
 * 金額はすべて CAD（取引日の FX レートで換算済みの値）で扱う。
 */

export interface LedgerTransaction {
  id: string;
  account_id: string;
  asset_id: string | null;
  type: TransactionType;
  trade_date: string;
  quantity: number;
  price: number;
  fee: number;
  fx_rate: number;
  amount_cad: number;
  fee_cad: number;
  transfer_account_id: string | null;
  created_at?: string;
}

export interface LedgerAccount {
  id: string;
  account_type: AccountType;
}

export interface Position {
  accountId: string;
  assetId: string;
  quantity: number;
  /** 保有分の取得原価合計（CAD） */
  acb: number;
  realizedGain: number;
  dividends: number;
}

export interface TaxPool {
  assetId: string;
  quantity: number;
  acb: number;
}

export interface RealizedEvent {
  transactionId: string;
  date: string;
  year: number;
  accountId: string;
  assetId: string;
  quantity: number;
  proceeds: number;
  /** 売却分の ACB（CAD） */
  costBase: number;
  gain: number;
  /** 課税口座での処分（税金計算の対象）か */
  taxable: boolean;
  kind: "sell" | "deemed_disposition";
}

export interface LedgerWarning {
  transactionId: string;
  code: "oversell" | "missing_fmv" | "unknown_account";
  message: string;
}

export interface Ledger {
  positions: Position[];
  taxPools: TaxPool[];
  realized: RealizedEvent[];
  warnings: LedgerWarning[];
  /** 入金 − 出金（CAD） */
  netContributions: number;
  dividendsTotal: number;
  feesTotal: number;
}

const EPS = 1e-12;

function key(accountId: string, assetId: string) {
  return `${accountId}|${assetId}`;
}

export function sortTransactions<T extends { trade_date: string; created_at?: string }>(txs: T[]): T[] {
  return txs
    .map((tx, i) => ({ tx, i }))
    .sort((a, b) => {
      if (a.tx.trade_date !== b.tx.trade_date) return a.tx.trade_date < b.tx.trade_date ? -1 : 1;
      const ca = a.tx.created_at ?? "";
      const cb = b.tx.created_at ?? "";
      if (ca !== cb) return ca < cb ? -1 : 1;
      return a.i - b.i;
    })
    .map(({ tx }) => tx);
}

export function computeLedger(transactions: LedgerTransaction[], accounts: LedgerAccount[]): Ledger {
  const accountTypes = new Map(accounts.map((a) => [a.id, a.account_type]));
  const positions = new Map<string, Position>();
  const pools = new Map<string, TaxPool>();
  const realized: RealizedEvent[] = [];
  const warnings: LedgerWarning[] = [];
  let netContributions = 0;
  let dividendsTotal = 0;
  let feesTotal = 0;

  const isTaxable = (accountId: string, txId: string) => {
    const t = accountTypes.get(accountId);
    if (!t) {
      warnings.push({ transactionId: txId, code: "unknown_account", message: "口座が見つかりません" });
      return true;
    }
    return isTaxableAccount(t);
  };

  const pos = (accountId: string, assetId: string) => {
    const k = key(accountId, assetId);
    let p = positions.get(k);
    if (!p) {
      p = { accountId, assetId, quantity: 0, acb: 0, realizedGain: 0, dividends: 0 };
      positions.set(k, p);
    }
    return p;
  };

  const pool = (assetId: string) => {
    let p = pools.get(assetId);
    if (!p) {
      p = { assetId, quantity: 0, acb: 0 };
      pools.set(assetId, p);
    }
    return p;
  };

  /** 数量 q をポジション/プールから取り除き、その ACB を返す */
  const removeFrom = (holder: { quantity: number; acb: number }, q: number) => {
    if (holder.quantity <= EPS) {
      holder.quantity = 0;
      holder.acb = 0;
      return 0;
    }
    const qty = Math.min(q, holder.quantity);
    const cost = (holder.acb * qty) / holder.quantity;
    holder.quantity -= qty;
    holder.acb -= cost;
    if (holder.quantity <= EPS) {
      holder.quantity = 0;
      holder.acb = 0;
    }
    return cost;
  };

  for (const tx of sortTransactions(transactions)) {
    const year = Number(tx.trade_date.slice(0, 4));

    switch (tx.type) {
      case "deposit":
        netContributions += tx.amount_cad;
        break;

      case "withdraw":
        netContributions -= tx.amount_cad;
        break;

      case "dividend":
        dividendsTotal += tx.amount_cad;
        if (tx.asset_id) pos(tx.account_id, tx.asset_id).dividends += tx.amount_cad;
        break;

      case "buy": {
        if (!tx.asset_id) break;
        // 取得原価 = 数量 × 単価 + 手数料（CAD）= amount_cad
        const cost = tx.amount_cad;
        const p = pos(tx.account_id, tx.asset_id);
        p.quantity += tx.quantity;
        p.acb += cost;
        if (isTaxable(tx.account_id, tx.id)) {
          const pl = pool(tx.asset_id);
          pl.quantity += tx.quantity;
          pl.acb += cost;
        }
        feesTotal += tx.fee_cad;
        break;
      }

      case "sell": {
        if (!tx.asset_id) break;
        const p = pos(tx.account_id, tx.asset_id);
        if (tx.quantity > p.quantity + EPS) {
          warnings.push({
            transactionId: tx.id,
            code: "oversell",
            message: `保有数量（${p.quantity}）より多く売却しています（${tx.quantity}）`,
          });
        }
        // 受取額 = 数量 × 単価 − 手数料（CAD）= amount_cad
        const proceeds = tx.amount_cad;
        const positionCost = removeFrom(p, tx.quantity);
        const taxable = isTaxable(tx.account_id, tx.id);
        // 課税口座はプール全体の平均 ACB で損益を出す
        const costBase = taxable ? removeFrom(pool(tx.asset_id), tx.quantity) : positionCost;
        const gain = proceeds - costBase;
        p.realizedGain += gain;
        feesTotal += tx.fee_cad;
        realized.push({
          transactionId: tx.id,
          date: tx.trade_date,
          year,
          accountId: tx.account_id,
          assetId: tx.asset_id,
          quantity: tx.quantity,
          proceeds,
          costBase,
          gain,
          taxable,
          kind: "sell",
        });
        break;
      }

      case "fee": {
        feesTotal += tx.fee_cad;
        // 数量で支払う手数料（例: BTC の送金手数料）は保有数量だけ減らし、ACB は残す
        if (tx.asset_id && tx.quantity > 0) {
          const p = pos(tx.account_id, tx.asset_id);
          p.quantity = Math.max(0, p.quantity - tx.quantity);
          if (p.quantity <= EPS) p.acb = 0;
          if (isTaxable(tx.account_id, tx.id)) {
            const pl = pool(tx.asset_id);
            pl.quantity = Math.max(0, pl.quantity - tx.quantity);
            if (pl.quantity <= EPS) pl.acb = 0;
          }
        }
        break;
      }

      case "transfer": {
        if (!tx.asset_id || !tx.transfer_account_id) break;
        const from = pos(tx.account_id, tx.asset_id);
        if (tx.quantity > from.quantity + EPS) {
          warnings.push({
            transactionId: tx.id,
            code: "oversell",
            message: `保有数量（${from.quantity}）より多く移動しています（${tx.quantity}）`,
          });
        }
        const qty = Math.min(tx.quantity, from.quantity);
        const movedCost = removeFrom(from, qty);
        const to = pos(tx.transfer_account_id, tx.asset_id);
        const fromTaxable = isTaxable(tx.account_id, tx.id);
        const toTaxable = isTaxable(tx.transfer_account_id, tx.id);
        // 時価（FMV）: 単価 × 数量 × FX
        const fmv = tx.price > 0 ? qty * tx.price * tx.fx_rate : null;

        if (fromTaxable === toTaxable) {
          // 同じ種類の口座間の移動は処分ではない。ACB をそのまま移す
          to.quantity += qty;
          to.acb += movedCost;
        } else {
          if (fmv === null) {
            warnings.push({
              transactionId: tx.id,
              code: "missing_fmv",
              message: "課税口座と登録口座の間の移動は時価での処分とみなされます。単価（時価）を入力してください",
            });
          }
          const value = fmv ?? movedCost;
          to.quantity += qty;
          to.acb += value;
          if (fromTaxable) {
            // 課税口座 → 登録口座: みなし譲渡
            const costBase = removeFrom(pool(tx.asset_id), qty);
            const gain = value - costBase;
            from.realizedGain += gain;
            realized.push({
              transactionId: tx.id,
              date: tx.trade_date,
              year,
              accountId: tx.account_id,
              assetId: tx.asset_id,
              quantity: qty,
              proceeds: value,
              costBase,
              gain,
              taxable: true,
              kind: "deemed_disposition",
            });
          } else {
            // 登録口座 → 課税口座: 時価で取得したものとして税務プールに加える
            const pl = pool(tx.asset_id);
            pl.quantity += qty;
            pl.acb += value;
          }
        }
        feesTotal += tx.fee_cad;
        break;
      }
    }
  }

  return {
    positions: [...positions.values()],
    taxPools: [...pools.values()],
    realized,
    warnings,
    netContributions,
    dividendsTotal,
    feesTotal,
  };
}

/** 平均取得単価（CAD）。保有 0 なら null */
export function averageCost(p: { quantity: number; acb: number }): number | null {
  return p.quantity > EPS ? p.acb / p.quantity : null;
}

/**
 * 1 つの資産について、日ごとの平均取得単価（全口座合計の数量・ACB から）を返す。
 * 取引のあった日だけを返すので、チャートでは階段状（stepAfter）に描く。
 */
export function averageCostHistory(
  transactions: LedgerTransaction[],
  accounts: LedgerAccount[],
  assetId: string,
): { date: string; avgCost: number | null }[] {
  const txs = sortTransactions(transactions.filter((t) => t.asset_id === assetId));
  const dates = [...new Set(txs.map((t) => t.trade_date))];
  return dates.map((date) => {
    const ledger = computeLedger(
      txs.filter((t) => t.trade_date <= date),
      accounts,
    );
    let quantity = 0;
    let acb = 0;
    for (const p of ledger.positions) {
      if (p.assetId !== assetId) continue;
      quantity += p.quantity;
      acb += p.acb;
    }
    return { date, avgCost: averageCost({ quantity, acb }) };
  });
}
