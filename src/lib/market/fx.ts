import { fetchJson } from "./types";

// Bank of Canada Valet API（キー不要）。営業日の 16:30 ET ごろに当日分が公開される
const BASE = "https://www.bankofcanada.ca/valet/observations";

export interface FxObservation {
  date: string;
  base: string;
  quote: string;
  rate: number;
  source: string;
}

interface ValetResponse {
  observations?: Array<{ d: string } & Record<string, { v: string } | string>>;
}

/** USD/CAD などを取得する（1 base = rate CAD） */
export async function fetchBocFx(
  base: string,
  opts: { recent?: number; startDate?: string } = { recent: 10 },
): Promise<FxObservation[]> {
  const series = `FX${base}CAD`;
  const qs = opts.startDate ? `start_date=${opts.startDate}` : `recent=${opts.recent ?? 10}`;
  const data = await fetchJson<ValetResponse>(`${BASE}/${series}/json?${qs}`, { timeoutMs: 30_000 });
  const out: FxObservation[] = [];
  for (const o of data.observations ?? []) {
    const cell = o[series];
    const v = typeof cell === "object" && cell ? Number(cell.v) : NaN;
    if (v > 0) out.push({ date: o.d, base, quote: "CAD", rate: v, source: "bank_of_canada" });
  }
  return out;
}
