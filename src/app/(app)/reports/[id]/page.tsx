import { notFound } from "next/navigation";
import { SimpleMarkdown } from "@/components/SimpleMarkdown";
import { PageHeader, Section } from "@/components/ui";
import { getDb, normalizeReport, requireUser } from "@/lib/data";
import { formatDateJa } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: PageProps<"/reports/[id]">) {
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const { data } = await db.from("reports").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const r = normalizeReport(data);
  return (
    <>
      <PageHeader title="レポート" back="/reports" />
      <div className="mb-2 flex items-center gap-2 text-sm text-muted">
        <span>{formatDateJa(r.report_date)}</span>
        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">{r.target.toUpperCase()}</span>
      </div>
      <h2 className="mb-4 text-lg font-bold leading-snug">{r.headline}</h2>

      {r.stance && (
        <div className="card mb-5 p-4">
          <div className="text-xs text-muted">スタンス</div>
          <div className="mt-1 font-semibold">{r.stance}</div>
        </div>
      )}

      {r.summary && (
        <Section title="サマリー">
          <div className="card p-4">
            <SimpleMarkdown text={r.summary} />
          </div>
        </Section>
      )}

      {r.dca_note && (
        <Section title="積立メモ">
          <div className="card p-4">
            <SimpleMarkdown text={r.dca_note} />
          </div>
        </Section>
      )}

      {r.events.length > 0 && (
        <Section title="イベント">
          <ul className="card divide-y divide-border">
            {r.events.map((e, i) => (
              <li key={i} className="flex gap-3 px-4 py-3 text-sm">
                <span className="w-24 shrink-0 text-muted">{e.date ? formatDateJa(e.date) : "—"}</span>
                <span>
                  <span className="font-medium">{e.title}</span>
                  {e.note && <span className="block text-xs text-muted">{e.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {r.sources.length > 0 && (
        <Section title="出典">
          <ul className="card divide-y divide-border">
            {r.sources.map((s, i) => (
              <li key={i} className="px-4 py-3 text-sm">
                {/^https?:\/\//.test(s.url) ? (
                  <a href={s.url} target="_blank" rel="noreferrer" className="break-all text-accent underline">
                    {s.title || s.url}
                  </a>
                ) : (
                  <span className="break-all">{s.title || s.url}</span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <p className="mt-6 text-center text-xs text-muted">作成: {r.author} · 情報提供のみを目的としたメモで、売買の推奨ではありません</p>
    </>
  );
}
