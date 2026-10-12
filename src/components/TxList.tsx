import { deleteTransaction } from "@/app/actions";
import { formatDateJa, formatMoney, formatQty, TX_TYPE_LABEL } from "@/lib/format";
import type { Account, Asset, Transaction } from "@/lib/types";
import { Empty } from "./ui";

export function TxList({
  transactions,
  accounts,
  assets,
}: {
  transactions: Transaction[];
  accounts: Account[];
  assets: Asset[];
}) {
  if (transactions.length === 0) return <Empty>取引の記録はまだありません</Empty>;
  const acc = new Map(accounts.map((a) => [a.id, a]));
  const ast = new Map(assets.map((a) => [a.id, a]));
  const rows = [...transactions].sort((a, b) =>
    a.trade_date !== b.trade_date ? (a.trade_date < b.trade_date ? 1 : -1) : a.created_at < b.created_at ? 1 : -1,
  );
  return (
    <ul className="card divide-y divide-border">
      {rows.map((t) => {
        const asset = t.asset_id ? ast.get(t.asset_id) : null;
        return (
          <li key={t.id} className="px-4 py-3">
            <details>
              <summary className="flex cursor-pointer list-none items-center gap-3">
                <span className="w-12 shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-center text-xs">{TX_TYPE_LABEL[t.type]}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {asset?.symbol ?? t.currency}
                    {t.quantity > 0 && <span className="ml-1 text-muted tabular-nums">{formatQty(t.quantity)}</span>}
                  </div>
                  <div className="text-xs text-muted">
                    {formatDateJa(t.trade_date, false)} · {acc.get(t.account_id)?.name}
                    {t.type === "transfer" && t.transfer_account_id && ` → ${acc.get(t.transfer_account_id)?.name}`}
                  </div>
                </div>
                <div className="text-right text-sm tabular-nums">{formatMoney(t.amount_cad)}</div>
              </summary>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                {t.price > 0 && (
                  <>
                    <dt className="text-muted">単価</dt>
                    <dd className="text-right tabular-nums">{formatMoney(t.price, t.currency)}</dd>
                  </>
                )}
                <dt className="text-muted">金額（{t.currency}）</dt>
                <dd className="text-right tabular-nums">{formatMoney(t.amount, t.currency)}</dd>
                <dt className="text-muted">手数料</dt>
                <dd className="text-right tabular-nums">{formatMoney(t.fee, t.currency)}</dd>
                {t.currency !== "CAD" && (
                  <>
                    <dt className="text-muted">FX（{t.currency}/CAD）</dt>
                    <dd className="text-right tabular-nums">{t.fx_rate}</dd>
                  </>
                )}
                {t.note && (
                  <>
                    <dt className="text-muted">メモ</dt>
                    <dd className="text-right">{t.note}</dd>
                  </>
                )}
              </dl>
              <form action={deleteTransaction} className="mt-3 text-right">
                <input type="hidden" name="id" value={t.id} />
                <button type="submit" className="text-xs text-loss">この取引を削除</button>
              </form>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
