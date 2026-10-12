"use client";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatMoney } from "@/lib/format";

export interface Slice {
  key: string;
  label: string;
  value: number;
}

const SERIES = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);

/** 資産配分のドーナツ。8 件を超える分は「その他」にまとめる（色は固定順で割り当て、使い回さない） */
export function foldSlices(slices: Slice[], max = 8): Slice[] {
  const sorted = [...slices].filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= max) return sorted;
  const head = sorted.slice(0, max - 1);
  const rest = sorted.slice(max - 1).reduce((s, x) => s + x.value, 0);
  return [...head, { key: "_other", label: "その他", value: rest }];
}

export function AllocationChart({ slices }: { slices: Slice[] }) {
  const data = foldSlices(slices);
  const total = data.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return null;
  return (
    <div className="flex items-center gap-4">
      <div className="h-36 w-36 shrink-0" role="img" aria-label="資産配分">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="100%"
              stroke={data.length > 1 ? "var(--surface)" : "none"}
              strokeWidth={2}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={false}
            >
              {data.map((d, i) => (
                <Cell key={d.key} fill={SERIES[i]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v) => [`${formatMoney(Number(v))}（${((Number(v) / total) * 100).toFixed(1)}%）`, ""]}
              contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)", fontSize: 12 }}
              itemStyle={{ color: "var(--text)" }}
              separator=""
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
        {data.map((d, i) => (
          <li key={d.key} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SERIES[i] }} aria-hidden />
            <span className="min-w-0 flex-1 truncate">{d.label}</span>
            <span className="tabular-nums text-muted">{((d.value / total) * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
