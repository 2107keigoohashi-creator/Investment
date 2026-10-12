import type { DcaFrequency } from "../types";
import { dcaDates } from "./dca";

/**
 * シミュレーター（売買の推奨ではなく、仮定の計算）。
 * - backtest: 過去の価格で「◯年前から積み立てていたら / 一括で買っていたら」
 * - projectFuture: 想定の年利で将来の金額を試算（複利・毎月積立）
 * 価格・金額はすべて CAD。手数料は考えない。
 */

export interface PricePoint {
  date: string;
  close: number;
}

export interface BacktestInput {
  prices: PricePoint[];
  mode: "dca" | "lump";
  /** 積立なら 1 回の金額、一括なら総額 */
  amount: number;
  frequency: DcaFrequency;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  start: string;
  end: string;
}

export interface BacktestPoint {
  date: string;
  invested: number;
  value: number;
}

export interface BacktestResult {
  purchases: number;
  invested: number;
  units: number;
  value: number;
  gain: number;
  gainPct: number | null;
  avgCost: number | null;
  lastPrice: number;
  firstDate: string;
  lastDate: string;
  /** 評価額の最大下落率（高値からの下落、%） */
  maxDrawdownPct: number;
  points: BacktestPoint[];
}

function sortPrices(prices: PricePoint[]) {
  return [...prices].filter((p) => p.close > 0).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** 長い系列を約 max 点に間引く（最後の点は必ず残す） */
export function downsample<T>(xs: T[], max = 300): T[] {
  if (xs.length <= max) return xs;
  const step = Math.ceil(xs.length / max);
  const out = xs.filter((_, i) => i % step === 0);
  if (out[out.length - 1] !== xs[xs.length - 1]) out.push(xs[xs.length - 1]);
  return out;
}

export function backtest(input: BacktestInput): BacktestResult | null {
  const prices = sortPrices(input.prices).filter((p) => p.date >= input.start && p.date <= input.end);
  if (prices.length === 0 || !(input.amount > 0)) return null;

  // 買う日: その日に価格がなければ、次に価格がある日に買う（週末・祝日）
  const buyDates =
    input.mode === "lump"
      ? [prices[0].date]
      : dcaDates(
          {
            frequency: input.frequency,
            day_of_week: input.dayOfWeek ?? null,
            day_of_month: input.dayOfMonth ?? null,
            start_date: input.start,
          },
          input.end,
        );

  const buysByIndex = new Map<number, number>();
  let j = 0;
  for (const d of buyDates) {
    while (j < prices.length && prices[j].date < d) j++;
    if (j >= prices.length) break;
    buysByIndex.set(j, (buysByIndex.get(j) ?? 0) + 1);
  }

  let units = 0;
  let invested = 0;
  let purchases = 0;
  let peak = 0;
  let maxDd = 0;
  const points: BacktestPoint[] = [];
  prices.forEach((p, i) => {
    const n = buysByIndex.get(i) ?? 0;
    for (let k = 0; k < n; k++) {
      units += input.amount / p.close;
      invested += input.amount;
      purchases++;
    }
    const value = units * p.close;
    if (value > peak) peak = value;
    if (peak > 0) maxDd = Math.max(maxDd, ((peak - value) / peak) * 100);
    if (invested > 0) points.push({ date: p.date, invested, value });
  });
  if (purchases === 0) return null;

  const last = prices[prices.length - 1];
  const value = units * last.close;
  return {
    purchases,
    invested,
    units,
    value,
    gain: value - invested,
    gainPct: invested > 0 ? ((value - invested) / invested) * 100 : null,
    avgCost: units > 0 ? invested / units : null,
    lastPrice: last.close,
    firstDate: points[0].date,
    lastDate: last.date,
    maxDrawdownPct: maxDd,
    points: downsample(points),
  };
}

export interface ProjectionInput {
  initial: number;
  monthly: number;
  /** 想定年利（%）。マイナスも可 */
  annualRatePct: number;
  years: number;
}

export interface ProjectionPoint {
  year: number;
  contributed: number;
  value: number;
}

/** 毎月積立・月複利での将来の試算 */
export function projectFuture(input: ProjectionInput): ProjectionPoint[] {
  const months = Math.max(0, Math.round(input.years * 12));
  const r = Math.pow(1 + input.annualRatePct / 100, 1 / 12) - 1;
  let value = Math.max(0, input.initial);
  let contributed = value;
  const out: ProjectionPoint[] = [{ year: 0, contributed, value }];
  for (let m = 1; m <= months; m++) {
    value = value * (1 + r) + input.monthly;
    contributed += input.monthly;
    if (m % 12 === 0 || m === months) out.push({ year: m / 12, contributed, value });
  }
  return out;
}

/** 過去の価格から年率リターン（CAGR, %）を出す。試算の「想定年利」の参考用 */
export function cagrPct(prices: PricePoint[]): number | null {
  const p = sortPrices(prices);
  if (p.length < 2) return null;
  const years = (Date.parse(p[p.length - 1].date) - Date.parse(p[0].date)) / (365.25 * 86_400_000);
  if (years < 0.5) return null;
  return (Math.pow(p[p.length - 1].close / p[0].close, 1 / years) - 1) * 100;
}
