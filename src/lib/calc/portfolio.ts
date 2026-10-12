import type { Position } from "./acb";

/**
 * 時価評価と含み損益（資産ごと・口座ごと・全体）。
 * 価格はすべて CAD に換算済みのものを渡す。
 */

export interface PricePoint {
  date: string;
  close: number;
  currency: string;
}

export interface FxPoint {
  date: string;
  /** 1 USD = rate CAD のような「1 base = rate CAD」 */
  rate: number;
}

export interface CadQuote {
  /** 最新の CAD 価格 */
  price: number;
  date: string;
  /** その前の日の CAD 価格（前日比用） */
  prevPrice: number | null;
  prevDate: string | null;
  /** 換算に使ったか（CAD 建ての価格がない場合 true） */
  converted: boolean;
}

/**
 * 1 資産の価格履歴から CAD の日次系列を作る。
 * CAD 建ての終値があればそれを使い、なければ他通貨 × その日以前で最新の FX レートで換算する。
 */
export function cadSeries(
  prices: PricePoint[],
  fxByCurrency: Record<string, FxPoint[]>,
): { date: string; close: number; converted: boolean }[] {
  const byDate = new Map<string, PricePoint[]>();
  for (const p of prices) {
    const arr = byDate.get(p.date) ?? [];
    arr.push(p);
    byDate.set(p.date, arr);
  }
  const out: { date: string; close: number; converted: boolean }[] = [];
  for (const date of [...byDate.keys()].sort()) {
    const rows = byDate.get(date)!;
    const cad = rows.find((r) => r.currency === "CAD");
    if (cad) {
      out.push({ date, close: cad.close, converted: false });
      continue;
    }
    for (const r of rows) {
      const fx = fxOnOrBefore(fxByCurrency[r.currency] ?? [], date);
      if (fx) {
        out.push({ date, close: r.close * fx.rate, converted: true });
        break;
      }
    }
  }
  return out;
}

/** date 以前で最も新しい FX レート。なければ一番古いものを返す（取得前の日付の補完用） */
export function fxOnOrBefore(series: FxPoint[], date: string): FxPoint | null {
  if (series.length === 0) return null;
  let best: FxPoint | null = null;
  for (const p of series) {
    if (p.date <= date && (!best || p.date > best.date)) best = p;
  }
  if (best) return best;
  return [...series].sort((a, b) => (a.date < b.date ? -1 : 1))[0];
}

export function latestCadQuote(
  prices: PricePoint[],
  fxByCurrency: Record<string, FxPoint[]>,
): CadQuote | null {
  const series = cadSeries(prices, fxByCurrency);
  if (series.length === 0) return null;
  const last = series[series.length - 1];
  const prev = series.length > 1 ? series[series.length - 2] : null;
  return {
    price: last.close,
    date: last.date,
    prevPrice: prev?.close ?? null,
    prevDate: prev?.date ?? null,
    converted: last.converted,
  };
}

export interface Holding {
  accountId: string;
  assetId: string;
  quantity: number;
  acb: number;
  marketValue: number | null;
  unrealized: number | null;
  dayChange: number | null;
}

export interface Summary {
  quantity: number;
  acb: number;
  marketValue: number;
  unrealized: number;
  /** 価格がないために評価できなかった ACB */
  unpricedAcb: number;
  dayChange: number;
}

export interface Valuation {
  holdings: Holding[];
  byAsset: Record<string, Summary>;
  byAccount: Record<string, Summary>;
  total: Summary;
}

function emptySummary(): Summary {
  return { quantity: 0, acb: 0, marketValue: 0, unrealized: 0, unpricedAcb: 0, dayChange: 0 };
}

function addTo(s: Summary, h: Holding) {
  s.quantity += h.quantity;
  s.acb += h.acb;
  if (h.marketValue === null) {
    s.unpricedAcb += h.acb;
  } else {
    s.marketValue += h.marketValue;
    s.unrealized += h.unrealized ?? 0;
    s.dayChange += h.dayChange ?? 0;
  }
}

/**
 * ポジションを時価評価する。
 * 現金（cash 資産）は quotes に price=1 を入れておけば同じ扱いになる。
 */
export function valuePortfolio(positions: Position[], quotes: Record<string, CadQuote | null>): Valuation {
  const holdings: Holding[] = positions
    .filter((p) => p.quantity > 1e-12)
    .map((p) => {
      const q = quotes[p.assetId] ?? null;
      const marketValue = q ? p.quantity * q.price : null;
      return {
        accountId: p.accountId,
        assetId: p.assetId,
        quantity: p.quantity,
        acb: p.acb,
        marketValue,
        unrealized: marketValue === null ? null : marketValue - p.acb,
        dayChange: q && q.prevPrice !== null ? p.quantity * (q.price - q.prevPrice) : q ? 0 : null,
      };
    });

  const byAsset: Record<string, Summary> = {};
  const byAccount: Record<string, Summary> = {};
  const total = emptySummary();
  for (const h of holdings) {
    addTo((byAsset[h.assetId] ??= emptySummary()), h);
    addTo((byAccount[h.accountId] ??= emptySummary()), h);
    addTo(total, h);
  }
  // 口座をまたいだ合計では数量の合計は資産ごとにしか意味がないので、口座・全体は 0 にしておく
  for (const s of Object.values(byAccount)) s.quantity = 0;
  total.quantity = 0;
  return { holdings, byAsset, byAccount, total };
}

/** 含み損益率（%）。ACB が 0 なら null */
export function unrealizedPct(s: { acb: number; unrealized: number; unpricedAcb?: number }): number | null {
  const base = s.acb - (s.unpricedAcb ?? 0);
  return base > 0 ? (s.unrealized / base) * 100 : null;
}
