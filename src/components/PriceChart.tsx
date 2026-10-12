"use client";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/format";

export interface ChartPoint {
  date: string;
  close: number;
}

const RANGES = [
  { key: "1w", label: "1週間", days: 7 },
  { key: "1m", label: "1か月", days: 31 },
  { key: "1y", label: "1年", days: 366 },
  { key: "all", label: "全期間", days: Infinity },
] as const;

function shiftDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** 価格（CAD）と平均取得単価（階段状）を同じ軸に重ねる */
export function PriceChart({
  prices,
  avgCost,
}: {
  prices: ChartPoint[];
  avgCost: { date: string; avgCost: number | null }[];
}) {
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("1m");

  const data = useMemo(() => {
    if (prices.length === 0) return [];
    const last = prices[prices.length - 1].date;
    const r = RANGES.find((x) => x.key === range)!;
    const from = Number.isFinite(r.days) ? shiftDays(last, r.days) : "";
    // 各日付時点の平均取得単価
    const sortedAvg = [...avgCost].sort((a, b) => (a.date < b.date ? -1 : 1));
    return prices
      .filter((p) => p.date >= from)
      .map((p) => {
        let avg: number | null = null;
        for (const a of sortedAvg) {
          if (a.date <= p.date) avg = a.avgCost;
          else break;
        }
        return { date: p.date, close: p.close, avg };
      });
  }, [prices, avgCost, range]);

  const hasAvg = data.some((d) => d.avg !== null);

  return (
    <div>
      <div className="mb-3 flex gap-2" role="group" aria-label="期間">
        {RANGES.map((r) => (
          <button key={r.key} type="button" className="chip" aria-pressed={range === r.key} onClick={() => setRange(r.key)}>
            {r.label}
          </button>
        ))}
      </div>
      {data.length < 2 ? (
        <p className="py-10 text-center text-sm text-muted">
          この期間の価格データが足りません。設定 →「過去の価格を取り込む」で過去データを入れられます。
        </p>
      ) : (
        <>
          <div className="mb-1 flex gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: "var(--series-1)" }} />
              価格（CAD）
            </span>
            {hasAvg && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: "var(--series-2)" }} />
                平均取得単価
              </span>
            )}
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "var(--muted)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--grid)" }}
                  tickFormatter={(d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`}
                  minTickGap={28}
                />
                <YAxis
                  orientation="right"
                  domain={["auto", "auto"]}
                  tick={{ fill: "var(--muted)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}K` : String(Math.round(v)))}
                />
                <Tooltip
                  cursor={{ stroke: "var(--muted)", strokeWidth: 1 }}
                  contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)", fontSize: 12 }}
                  labelStyle={{ color: "var(--muted)" }}
                  formatter={(v, name) => [formatMoney(Number(v)), name === "avg" ? "平均取得単価" : "価格"]}
                />
                <Line type="monotone" dataKey="close" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }} />
                {hasAvg && (
                  <Line type="stepAfter" dataKey="avg" stroke="var(--series-2)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls={false} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
