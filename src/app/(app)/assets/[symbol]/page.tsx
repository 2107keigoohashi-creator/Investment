import Link from "next/link";
import { notFound } from "next/navigation";
import { PriceChart } from "@/components/PriceChart";
import { ReportList } from "@/components/ReportList";
import { TxList } from "@/components/TxList";
import { PageHeader, Section, StaleBadge } from "@/components/ui";
import { averageCost, averageCostHistory, computeLedger } from "@/lib/calc/acb";
import { todayIn } from "@/lib/calc/dates";
import { cadSeries, latestCadQuote, unrealizedPct } from "@/lib/calc/portfolio";
import { getDb, loadAccounts, loadFx, loadPrices, loadReports, loadTransactions, requireUser, TZ } from "@/lib/data";
import { ACCOUNT_TYPE_LABEL, ASSET_TYPE_LABEL, formatMoney, formatPct, formatQty, formatSigned, signClass, staleLabel } from "@/lib/format";
import type { Asset } from "@/lib/types";
import { ManualPriceForm } from "./ManualPriceForm";

export const dynamic = "force-dynamic";

export default async function AssetPage({ params }: PageProps<"/assets/[symbol]">) {
  await requireUser();
  const { symbol: raw } = await params;
  const symbol = decodeURIComponent(raw).toUpperCase();
  const db = await getDb();
  const { data: assetRow } = await db.from("assets").select("*").eq("symbol", symbol).maybeSingle();
  if (!assetRow) notFound();
  const asset = assetRow as Asset;

  const [accounts, transactions, prices, fx, reports] = await Promise.all([
    loadAccounts(db),
    loadTransactions(db, asset.id),
    loadPrices(db, { assetId: asset.id }),
    loadFx(db),
    loadReports(db, { target: asset.symbol, limit: 30 }),
  ]);
  const today = todayIn(TZ);
  const ledger = computeLedger(transactions, accounts);
  const positions = ledger.positions.filter((p) => p.assetId === asset.id);
  const quantity = positions.reduce((s, p) => s + p.quantity, 0);
  const acb = positions.reduce((s, p) => s + p.acb, 0);
  const realized = ledger.realized.filter((e) => e.assetId === asset.id).reduce((s, e) => s + e.gain, 0);
  const quote = latestCadQuote(prices, fx);
  const mv = quote ? quantity * quote.price : null;
  const unrealized = mv !== null ? mv - acb : null;
  const avg = averageCost({ quantity, acb });
  const series = cadSeries(prices, fx).map(({ date, close }) => ({ date, close }));
  const usd = prices.filter((p) => p.currency === "USD").at(-1);
  const chg = quote?.prevPrice ? ((quote.price - quote.prevPrice) / quote.prevPrice) * 100 : null;

  return (
    <>
      <PageHeader
        title={asset.symbol}
        back="/"
        action={
          <Link href={`/transactions/new?asset=${encodeURIComponent(asset.symbol)}`} className="btn btn-primary text-sm">
            記録
          </Link>
        }
      />
      <p className="-mt-3 mb-4 text-sm text-muted">
        {asset.name} · {ASSET_TYPE_LABEL[asset.asset_type]}
        {asset.exchange ? ` · ${asset.exchange}` : ""}
      </p>

      <section className="card mb-5 p-4">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular-nums">{quote ? formatMoney(quote.price) : "—"}</span>
          <span className={`text-sm ${signClass(chg)}`}>{formatPct(chg)}</span>
          <StaleBadge label={quote ? staleLabel(quote.date, today) : null} />
        </div>
        {usd && <div className="mb-3 text-sm text-muted tabular-nums">{formatMoney(usd.close, "USD", 0)}（USD）</div>}
        <PriceChart prices={series} avgCost={averageCostHistory(transactions, accounts, asset.id)} />
      </section>

      <Section title="保有状況">
        <dl className="card grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-sm">
          <div>
            <dt className="text-muted">保有数量</dt>
            <dd className="font-semibold tabular-nums">{formatQty(quantity)}</dd>
          </div>
          <div>
            <dt className="text-muted">平均取得単価</dt>
            <dd className="font-semibold tabular-nums">{formatMoney(avg)}</dd>
          </div>
          <div>
            <dt className="text-muted">時価</dt>
            <dd className="tabular-nums">{formatMoney(mv)}</dd>
          </div>
          <div>
            <dt className="text-muted">取得原価（ACB）</dt>
            <dd className="tabular-nums">{formatMoney(acb)}</dd>
          </div>
          <div>
            <dt className="text-muted">含み損益</dt>
            <dd className={`tabular-nums ${signClass(unrealized)}`}>
              {formatSigned(unrealized)}
              <span className="ml-1 text-xs">{formatPct(unrealized !== null ? unrealizedPct({ acb, unrealized }) : null)}</span>
            </dd>
          </div>
          <div>
            <dt className="text-muted">確定損益</dt>
            <dd className={`tabular-nums ${signClass(realized)}`}>{formatSigned(realized)}</dd>
          </div>
        </dl>
        {positions.filter((p) => p.quantity > 0).length > 1 && (
          <ul className="card mt-2 divide-y divide-border text-sm">
            {positions
              .filter((p) => p.quantity > 0)
              .map((p) => {
                const a = accounts.find((x) => x.id === p.accountId);
                const pmv = quote ? p.quantity * quote.price : null;
                return (
                  <li key={p.accountId} className="flex items-center justify-between px-4 py-2">
                    <span>
                      {a?.name} <span className="text-xs text-muted">{a ? ACCOUNT_TYPE_LABEL[a.account_type] : ""}</span>
                    </span>
                    <span className="text-right tabular-nums">
                      {formatQty(p.quantity)}
                      <span className={`ml-2 text-xs ${signClass(pmv !== null ? pmv - p.acb : null)}`}>
                        {formatSigned(pmv !== null ? pmv - p.acb : null)}
                      </span>
                    </span>
                  </li>
                );
              })}
          </ul>
        )}
      </Section>

      <Section title="取引履歴">
        <TxList transactions={transactions} accounts={accounts} assets={[asset]} />
      </Section>

      <Section title="レポート">
        <ReportList reports={reports} today={today} />
      </Section>

      <Section title="価格を手入力">
        <ManualPriceForm assetId={asset.id} defaultCurrency={asset.currency} today={today} />
      </Section>
    </>
  );
}
