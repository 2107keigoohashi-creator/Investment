import Link from "next/link";
import { formatDateJa } from "@/lib/format";
import type { Report } from "@/lib/types";
import { Empty } from "./ui";

export function ReportList({ reports, today }: { reports: Report[]; today: string }) {
  if (reports.length === 0) return <Empty>レポートはまだありません</Empty>;
  return (
    <ul className="card divide-y divide-border">
      {reports.map((r) => (
        <li key={r.id}>
          <Link href={`/reports/${r.id}`} className="block px-4 py-3">
            <div className="mb-0.5 flex items-center gap-2 text-xs text-muted">
              <span>{formatDateJa(r.report_date)}</span>
              <span className="rounded bg-surface-2 px-1.5 py-0.5">{r.target.toUpperCase()}</span>
              {r.report_date === today && <span className="font-semibold text-accent">今日</span>}
            </div>
            <p className="text-sm font-medium leading-snug">{r.headline}</p>
            {r.stance && <p className="mt-1 text-xs text-muted">スタンス: {r.stance}</p>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
