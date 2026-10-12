// 表示用のフォーマット（日本語 UI、金額は CAD）

const cad0 = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const cad2 = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "CAD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatMoney(n: number | null | undefined, currency = "CAD", digits?: number): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (currency === "CAD" && digits === undefined) return Math.abs(n) >= 1000 ? cad0.format(n) : cad2.format(n);
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency,
    minimumFractionDigits: digits ?? 2,
    maximumFractionDigits: digits ?? 2,
  }).format(n);
}

export function formatSigned(n: number | null | undefined, currency = "CAD"): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const s = formatMoney(Math.abs(n), currency);
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : s;
}

export function formatPct(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits)}%`;
}

export function formatQty(n: number | null | undefined, maxDigits = 8): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: maxDigits }).format(n);
}

export function formatNumber(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("ja-JP", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function formatDateJa(d: string | null | undefined, withWeekday = true): string {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
  return `${y}/${m}/${day}${withWeekday ? `（${WEEKDAYS[wd]}）` : ""}`;
}

/** 「今日の値」「3日前の値」 */
export function staleLabel(date: string | null | undefined, today: string): string | null {
  if (!date) return null;
  const days = Math.round((Date.parse(today) - Date.parse(date.slice(0, 10))) / 86_400_000);
  if (days <= 0) return null;
  return `${days}日前の値`;
}

export function signClass(n: number | null | undefined): string {
  if (!n) return "text-muted";
  return n > 0 ? "text-gain" : "text-loss";
}

export const TX_TYPE_LABEL: Record<string, string> = {
  buy: "買い",
  sell: "売り",
  deposit: "入金",
  withdraw: "出金",
  dividend: "配当",
  fee: "手数料",
  transfer: "移動",
};

export const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  tfsa: "TFSA",
  rrsp: "RRSP",
  fhsa: "FHSA",
  non_registered: "課税口座",
  exchange: "取引所",
};

export const ASSET_TYPE_LABEL: Record<string, string> = {
  crypto: "暗号資産",
  stock: "株式",
  etf: "ETF",
  cash: "現金",
};

export const FREQUENCY_LABEL: Record<string, string> = {
  daily: "毎日",
  weekly: "毎週",
  biweekly: "2週ごと",
  monthly: "毎月",
};

export const WEEKDAY_LABEL = WEEKDAYS;
