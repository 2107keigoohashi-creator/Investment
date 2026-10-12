import Link from "next/link";
import { ReportList } from "@/components/ReportList";
import { PageHeader } from "@/components/ui";
import { todayIn } from "@/lib/calc/dates";
import { asUser, loadReports, TZ } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const sp = await searchParams;
  const target = typeof sp.target === "string" ? sp.target : undefined;
  const all = await asUser((tx) => loadReports(tx, { limit: 200 }));
  const targets = [...new Set(all.map((r) => r.target.toLowerCase()))];
  const reports = target ? all.filter((r) => r.target.toLowerCase() === target.toLowerCase()) : all;
  return (
    <>
      <PageHeader title="レポート" />
      {targets.length > 1 && (
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
          <Link href="/reports" className="chip" aria-current={!target ? "page" : undefined}>
            すべて
          </Link>
          {targets.map((t) => (
            <Link key={t} href={`/reports?target=${encodeURIComponent(t)}`} className="chip" aria-current={target?.toLowerCase() === t ? "page" : undefined}>
              {t.toUpperCase()}
            </Link>
          ))}
        </div>
      )}
      <ReportList reports={reports} today={todayIn(TZ)} />
    </>
  );
}
