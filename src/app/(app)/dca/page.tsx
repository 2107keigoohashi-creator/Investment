import { deleteDcaPlan, toggleDcaPlan } from "@/app/actions";
import { Empty, Notice, PageHeader, Section } from "@/components/ui";
import { addDays, todayIn } from "@/lib/calc/dates";
import { compareDcaVsLumpSum, nextDcaDate } from "@/lib/calc/dca";
import { cadSeries } from "@/lib/calc/portfolio";
import { asUser, loadAccounts, loadAssets, loadDcaPlans, loadFx, loadPrices, TZ } from "@/lib/data";
import { formatDateJa, formatMoney, formatPct, formatQty, FREQUENCY_LABEL, signClass, WEEKDAY_LABEL } from "@/lib/format";
import { DcaForm } from "./DcaForm";

export const dynamic = "force-dynamic";

export default async function DcaPage() {
  const today = todayIn(TZ);
  const { accounts, assets, plans, prices, fx } = await asUser(async (tx) => ({
    accounts: await loadAccounts(tx),
    assets: await loadAssets(tx),
    plans: await loadDcaPlans(tx),
    prices: await loadPrices(tx, { since: addDays(today, -366) }),
    fx: await loadFx(tx, addDays(today, -400)),
  }));
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const scheduleText = (p: (typeof plans)[number]) => {
    if (p.frequency === "monthly") return `毎月 ${p.day_of_month ?? Number(p.start_date.slice(8, 10))} 日`;
    if (p.frequency === "weekly" || p.frequency === "biweekly")
      return `${FREQUENCY_LABEL[p.frequency]} ${WEEKDAY_LABEL[p.day_of_week ?? new Date(p.start_date).getUTCDay()]}曜`;
    return FREQUENCY_LABEL[p.frequency];
  };

  return (
    <>
      <PageHeader title="積立（DCA）" back="/menu" />

      <Section title="積立ルール">
        {plans.length === 0 ? (
          <Empty>まだ積立ルールがありません。下のフォームから追加できます。</Empty>
        ) : (
          <ul className="space-y-3">
            {plans.map((p) => {
              const asset = assetById.get(p.asset_id);
              const next = nextDcaDate(p, today);
              // 過去 1 年、このルールで積み立てていた場合と一括で買った場合の比較
              const series = cadSeries(prices.filter((x) => x.asset_id === p.asset_id), fx);
              const cmp =
                series.length > 1
                  ? compareDcaVsLumpSum({ ...p, start_date: series[0].date }, p.amount, series, today)
                  : null;
              return (
                <li key={p.id} className={`card p-4 ${p.is_active ? "" : "opacity-60"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">
                        {asset?.symbol} {formatMoney(p.amount, p.currency)}
                      </div>
                      <div className="text-sm text-muted">
                        {scheduleText(p)} · {accountById.get(p.account_id)?.name}
                      </div>
                    </div>
                    <form action={toggleDcaPlan}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="is_active" value={String(!p.is_active)} />
                      <button className="chip" type="submit">{p.is_active ? "有効" : "無効"}</button>
                    </form>
                  </div>
                  {p.is_active && (
                    <p className="mt-2 text-sm">
                      次に買う予定日: <span className="font-semibold">{formatDateJa(next)}</span>
                      {next === today && <span className="ml-1 text-accent">今日</span>}
                    </p>
                  )}
                  {cmp && (
                    <div className="mt-3 rounded-xl bg-surface-2 p-3 text-sm">
                      <div className="mb-2 text-xs text-muted">
                        過去データでの比較（{formatDateJa(series[0].date, false)}〜、{cmp.periods} 回・計 {formatMoney(cmp.invested)}、手数料なし）
                      </div>
                      <table className="w-full text-right tabular-nums">
                        <thead className="text-xs text-muted">
                          <tr>
                            <th className="text-left font-normal" />
                            <th className="font-normal">数量</th>
                            <th className="font-normal">現在の評価額</th>
                            <th className="font-normal">損益率</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="text-left">積立</td>
                            <td>{formatQty(cmp.dca.units, 6)}</td>
                            <td>{formatMoney(cmp.dca.value)}</td>
                            <td className={signClass(cmp.dca.value - cmp.invested)}>{formatPct(((cmp.dca.value - cmp.invested) / cmp.invested) * 100)}</td>
                          </tr>
                          <tr>
                            <td className="text-left">一括</td>
                            <td>{formatQty(cmp.lumpSum.units, 6)}</td>
                            <td>{formatMoney(cmp.lumpSum.value)}</td>
                            <td className={signClass(cmp.lumpSum.value - cmp.invested)}>{formatPct(((cmp.lumpSum.value - cmp.invested) / cmp.invested) * 100)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                  <form action={deleteDcaPlan} className="mt-2 text-right">
                    <input type="hidden" name="id" value={p.id} />
                    <button type="submit" className="text-xs text-loss">削除</button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="積立ルールを追加">
        <DcaForm
          assets={assets.filter((a) => a.is_active && a.asset_type !== "cash")}
          accounts={accounts.filter((a) => a.is_active)}
          today={today}
        />
      </Section>

      <Notice>積立ルールは予定の管理用です。実際の購入は取引所で行い、「記録」から登録してください。</Notice>
    </>
  );
}
