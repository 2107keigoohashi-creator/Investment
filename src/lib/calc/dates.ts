// 日付は 'YYYY-MM-DD' 文字列で扱う（タイムゾーンのずれを避けるため UTC で計算する）

export function parseDate(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: string, days: number): string {
  const date = parseDate(d);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseDate(a).getTime() - parseDate(b).getTime()) / 86_400_000);
}

export function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** 指定タイムゾーンでの「今日」（YYYY-MM-DD） */
export function todayIn(timeZone = "America/Vancouver", now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** 指定タイムゾーンでの現在の時（0-23） */
export function hourIn(timeZone = "America/Vancouver", now: Date = new Date()): number {
  const h = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(now);
  return Number(h);
}
