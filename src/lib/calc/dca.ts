import type { DcaFrequency } from "../types";
import { addDays, daysInMonth, formatDate, parseDate } from "./dates";

export interface DcaSchedule {
  frequency: DcaFrequency;
  day_of_week: number | null;
  day_of_month: number | null;
  start_date: string;
}

/** start 以降で最初に曜日 dow になる日 */
function firstWeekdayOnOrAfter(start: string, dow: number): string {
  const d = parseDate(start).getUTCDay();
  return addDays(start, (dow - d + 7) % 7);
}

function monthlyDate(year: number, month0: number, dom: number): string {
  const day = Math.min(dom, daysInMonth(year, month0));
  return formatDate(new Date(Date.UTC(year, month0, day)));
}

/** 次に買う予定日（today 当日を含む） */
export function nextDcaDate(plan: DcaSchedule, today: string): string {
  const from = plan.start_date > today ? plan.start_date : today;
  switch (plan.frequency) {
    case "daily":
      return from;
    case "weekly": {
      const dow = plan.day_of_week ?? parseDate(plan.start_date).getUTCDay();
      return firstWeekdayOnOrAfter(from, dow);
    }
    case "biweekly": {
      const dow = plan.day_of_week ?? parseDate(plan.start_date).getUTCDay();
      const anchor = firstWeekdayOnOrAfter(plan.start_date, dow);
      if (anchor >= from) return anchor;
      const diff = Math.round((parseDate(from).getTime() - parseDate(anchor).getTime()) / 86_400_000);
      return addDays(anchor, Math.ceil(diff / 14) * 14);
    }
    case "monthly": {
      const dom = plan.day_of_month ?? parseDate(plan.start_date).getUTCDate();
      const f = parseDate(from);
      const candidate = monthlyDate(f.getUTCFullYear(), f.getUTCMonth(), dom);
      if (candidate >= from) return candidate;
      return monthlyDate(f.getUTCFullYear(), f.getUTCMonth() + 1, dom);
    }
  }
}

/** start〜end の間の積立日をすべて列挙する */
export function dcaDates(plan: DcaSchedule, end: string): string[] {
  const out: string[] = [];
  let d = nextDcaDate(plan, plan.start_date);
  let guard = 0;
  while (d <= end && guard++ < 10_000) {
    out.push(d);
    d = nextDcaDate(plan, addDays(d, 1));
  }
  return out;
}

export interface DcaComparison {
  periods: number;
  invested: number;
  dca: { units: number; value: number; avgCost: number | null };
  lumpSum: { units: number; value: number; price: number | null };
}

/**
 * 積立した場合と、同じ総額を初日に一括で買った場合の比較（手数料は考慮しない）。
 * prices は日付昇順の CAD 価格。各積立日にはその日以前で最新の価格で買ったとみなす。
 */
export function compareDcaVsLumpSum(
  plan: DcaSchedule,
  amountPerPeriod: number,
  prices: { date: string; close: number }[],
  end: string,
): DcaComparison | null {
  if (prices.length === 0) return null;
  const sorted = [...prices].sort((a, b) => (a.date < b.date ? -1 : 1));
  const priceOn = (date: string) => {
    let p: number | null = null;
    for (const row of sorted) {
      if (row.date <= date) p = row.close;
      else break;
    }
    return p;
  };
  const dates = dcaDates(plan, end).filter((d) => priceOn(d) !== null);
  if (dates.length === 0) return null;

  let units = 0;
  for (const d of dates) units += amountPerPeriod / priceOn(d)!;
  const invested = amountPerPeriod * dates.length;
  const lastPrice = sorted[sorted.length - 1].close;
  const lumpPrice = priceOn(dates[0]);
  const lumpUnits = lumpPrice ? invested / lumpPrice : 0;

  return {
    periods: dates.length,
    invested,
    dca: { units, value: units * lastPrice, avgCost: units > 0 ? invested / units : null },
    lumpSum: { units: lumpUnits, value: lumpUnits * lastPrice, price: lumpPrice },
  };
}
