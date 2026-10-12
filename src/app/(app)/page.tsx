import Link from "next/link";
import { AllocationChart } from "@/components/AllocationChart";
import { Empty, Section, StaleBadge } from "@/components/ui";
import { unrealizedPct } from "@/lib/calc/portfolio";
import { getDb, latestMetric, loadPortfolio, loadReports } from "@/lib/data";
import {
  ACCOUNT_TYPE_LABEL,
  formatDateJa,
  formatMoney,
  formatPct,
  formatQty,
  formatSigned,
  signClass,
  staleLabel,
} from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const db = await getDb();
  const [p, fearGreed, reports] = await Promise.all([
    loadPortfolio(),
    latestMetric(db, "fear_greed"),
    loadReports(db, { limit: 1 }),
  ]);
  const { valuation: v, assets, accounts, quotes, today } = p;
  const report = reports[0] ?? null;
  const hasHoldings = v.holdings.length > 0;
  const prevTotal = v.total.marketValue - v.total.dayChange;
  const dayPct = prevTotal > 0 ? (v.total.dayChange / prevTotal) * 100 : null;
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const tracked = assets.filter((a) => a.is_active && a.asset_type !== "cash");

  return (
    <>
      <header className="mb-4 flex items-baseline justify-between pt-2">
        <h1 className="text-xl font-bold">Maru Invest</h1>
        <span className="text-sm text-muted">{formatDateJa(today)}</span>
      </header>

      {/* 総資産 */}
      <section className="card mb-5 p-5">
        <div className="text-sm text-muted">総資産（CAD）</div>
        <div className="mt-1 text-4xl font-bold tracking-tight tabular-nums">{formatMoney(v.total.marketValue)}</div>
        {hasHoldings ? (
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted">前日比</dt>
              <dd className={`font-semibold tabular-nums ${signClass(v.total.dayChange)}`}>
                {formatSigned(v.total.dayChange)} <span className="font-normal">{formatPct(dayPct)}</span>
              </dd>
            </div>
            <div>
              <dt className="text-muted">含み損益</dt>
              <dd className={`font-semibold tabular-nums ${signClass(v.total.unrealized)}`}>
                {formatSigned(v.total.unrealized)} <span className="font-normal">{formatPct(unrealizedPct(v.total))}</span>
              </dd>
            </div>
            <div>
              <dt className="text-muted">取得原価（ACB）</dt>
              <dd className="tabular-nums">{formatMoney(v.total.acb)}</dd>
            </div>
            <div>
              <dt className="text-muted">確定損益（累計）</dt>
              <dd className={`tabular-nums ${signClass(p.ledger.realized.reduce((s, e) => s + e.gain, 0))}`}>
                {formatSigned(p.ledger.realized.reduce((s, e) => s + e.gain, 0))}
              </dd>
            </div>
          </dl>
        ) : (
          <div className="mt-3 text-sm text-muted">
            まだ取引の記録がありません。
            <Link href="/transactions/new" className="ml-1 font-semibold text-accent">
              最初の取引を記録する →
            </Link>
          </div>
        )}
        {v.total.unpricedAcb > 0 && (
          <p className="mt-3 text-xs text-warn">価格がない銘柄（取得原価 {formatMoney(v.total.unpricedAcb)}）は総資産に含まれていません</p>
        )}
      </section>

      {/* 今朝のレポート */}
      <Section title="今朝のレポート" action={<Link href="/reports" className="text-sm text-accent">一覧</Link>}>
        {report ? (
          <Link href={`/reports/${report.id}`} className="card block p-4">
            <div className="mb-1 flex items-center text-xs text-muted">
              {formatDateJa(report.report_date)} · {report.target.toUpperCase()}
              <StaleBadge label={staleLabel(report.report_date, today)?.replace("の値", "のレポート") ?? null} />
            </div>
            <p className="font-semibold leading-snug">{report.headline}</p>
            {report.stance && (
              <p className="mt-2 inline-block rounded-lg bg-surface-2 px-2 py-1 text-xs">スタンス: {report.stance}</p>
            )}
          </Link>
        ) : (
          <Empty>まだレポートがありません</Empty>
        )}
      </Section>

      {/* 価格 */}
      <Section title="価格">
        <ul className="card divide-y divide-border">
          {tracked.map((a) => {
            const q = quotes[a.id];
            const chg = q && q.prevPrice ? ((q.price - q.prevPrice) / q.prevPrice) * 100 : null;
            return (
              <li key={a.id}>
                <Link href={`/assets/${encodeURIComponent(a.symbol)}`} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{a.symbol}</div>
                    <div className="truncate text-xs text-muted">{a.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="tabular-nums font-semibold">{q ? formatMoney(q.price) : "—"}</div>
                    <div className="text-xs">
                      <span className={signClass(chg)}>{formatPct(chg)}</span>
                      <StaleBadge label={q ? staleLabel(q.date, today) : null} />
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
          {fearGreed && (
            <li className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">恐怖強欲指数</div>
                <div className="text-xs text-muted">Crypto Fear &amp; Greed（alternative.me）</div>
              </div>
              <div className="text-right">
                <div className="tabular-nums font-semibold">{fearGreed.value}</div>
                <div className="text-xs text-muted">
                  {fearGreed.label}
                  <StaleBadge label={staleLabel(fearGreed.date, today)} />
                </div>
              </div>
            </li>
          )}
        </ul>
      </Section>

      {hasHoldings && (
        <>
          <Section title="資産配分">
            <div className="card p-4">
              <AllocationChart
                slices={Object.entries(v.byAsset).map(([id, s]) => ({
                  key: id,
                  label: assetById.get(id)?.symbol ?? "?",
                  value: s.marketValue,
                }))}
              />
            </div>
          </Section>

          <Section title="資産ごと">
            <ul className="card divide-y divide-border">
              {Object.entries(v.byAsset)
                .sort(([, a], [, b]) => b.marketValue - a.marketValue)
                .map(([id, s]) => {
                  const a = assetById.get(id);
                  return (
                    <li key={id}>
                      <Link href={`/assets/${encodeURIComponent(a?.symbol ?? id)}`} className="flex items-center gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold">{a?.symbol}</div>
                          <div className="text-xs text-muted tabular-nums">{formatQty(s.quantity)}</div>
                        </div>
                        <div className="text-right">
                          <div className="tabular-nums">{formatMoney(s.marketValue)}</div>
                          <div className={`text-xs tabular-nums ${signClass(s.unrealized)}`}>
                            {formatSigned(s.unrealized)}（{formatPct(unrealizedPct(s))}）
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </Section>

          <Section title="口座ごと">
            <ul className="card divide-y divide-border">
              {accounts
                .filter((acc) => v.byAccount[acc.id])
                .map((acc) => {
                  const s = v.byAccount[acc.id];
                  return (
                    <li key={acc.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{acc.name}</div>
                        <div className="text-xs text-muted">{ACCOUNT_TYPE_LABEL[acc.account_type]}</div>
                      </div>
                      <div className="text-right">
                        <div className="tabular-nums">{formatMoney(s.marketValue)}</div>
                        <div className={`text-xs tabular-nums ${signClass(s.unrealized)}`}>
                          {formatSigned(s.unrealized)}（{formatPct(unrealizedPct(s))}）
                        </div>
                      </div>
                    </li>
                  );
                })}
            </ul>
          </Section>
        </>
      )}

      {p.ledger.warnings.length > 0 && (
        <Section title="確認が必要な取引">
          <ul className="space-y-2">
            {p.ledger.warnings.map((w, i) => (
              <li key={i} className="rounded-xl bg-warn-bg px-3 py-2 text-sm text-warn">
                {w.message}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
