"use client";
import { useActionState, useMemo, useState } from "react";
import { createTransaction, type ActionState } from "@/app/actions";
import { FormMessage, SubmitButton } from "@/components/SubmitButton";
import { derivePriceFromProceeds, derivePriceFromTotal } from "@/lib/calc/transaction";
import { formatMoney, TX_TYPE_LABEL } from "@/lib/format";
import type { Account, Asset, TransactionType } from "@/lib/types";

const TYPES: TransactionType[] = ["buy", "sell", "deposit", "withdraw", "dividend", "fee", "transfer"];

const parse = (s: string) => {
  const n = Number(s.replace(/,/g, ""));
  return s.trim() === "" || !Number.isFinite(n) ? 0 : n;
};

/**
 * スマホで 3 タップ以内: ①金額 ②数量 ③記録。
 * 種類・銘柄・口座・日付は前回の値/今日が入っているので、普段は触らなくてよい。
 */
export function TransactionForm({
  accounts,
  assets,
  defaultAccountId,
  defaultAssetId,
  today,
  usdCad,
}: {
  accounts: Account[];
  assets: Asset[];
  defaultAccountId: string;
  defaultAssetId: string;
  today: string;
  usdCad: { date: string; rate: number } | null;
}) {
  const [state, action] = useActionState<ActionState, FormData>(createTransaction, {});
  const [type, setType] = useState<TransactionType>("buy");
  const [accountId, setAccountId] = useState(defaultAccountId);
  const [assetId, setAssetId] = useState(defaultAssetId);
  const account = accounts.find((a) => a.id === accountId);
  const asset = assets.find((a) => a.id === assetId);
  const [currency, setCurrency] = useState(account?.currency ?? "CAD");
  const [total, setTotal] = useState("");
  const [quantity, setQuantity] = useState("");
  const [fee, setFee] = useState("");
  const [priceOverride, setPriceOverride] = useState("");
  const [fx, setFx] = useState(usdCad ? String(usdCad.rate) : "");
  const [showDetails, setShowDetails] = useState(false);
  // エラーで戻ったときに入力が消えないよう、すべて controlled にする
  const [tradeDate, setTradeDate] = useState(today);
  const [note, setNote] = useState("");
  const [transferTo, setTransferTo] = useState("");

  const needsQty = type === "buy" || type === "sell" || type === "transfer";
  const amountLike = type === "deposit" || type === "withdraw" || type === "dividend";
  const tradeAssets = assets.filter((a) => a.asset_type !== "cash");

  const derived = useMemo(() => {
    if (priceOverride) return parse(priceOverride);
    const q = parse(quantity);
    const t = parse(total);
    const f = parse(fee);
    if (type === "buy") return derivePriceFromTotal(q, t, f);
    if (type === "sell") return derivePriceFromProceeds(q, t, f);
    return null;
  }, [type, quantity, total, fee, priceOverride]);

  const fxRate = currency === "CAD" ? 1 : parse(fx);
  const cadTotal = parse(total) * fxRate;

  const onAccountChange = (id: string) => {
    setAccountId(id);
    const acc = accounts.find((a) => a.id === id);
    if (acc) setCurrency(acc.currency);
  };

  const totalLabel =
    type === "buy" ? "支払額（手数料込み）" : type === "sell" ? "受取額（手数料差し引き後）" : type === "fee" ? "手数料" : "金額";

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="redirect_to" value={asset && needsQty ? `/assets/${encodeURIComponent(asset.symbol)}` : "/"} />
      {/* buy/sell は単価、入出金・配当は金額、手数料は fee としてサーバーに送る */}
      <input type="hidden" name="price" value={needsQty ? (derived ?? "") : ""} />
      <input type="hidden" name="amount" value={amountLike ? total : ""} />
      {type === "fee" && <input type="hidden" name="fee" value={total} />}

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="取引の種類">
        {TYPES.map((t) => (
          <button key={t} type="button" className="chip" aria-pressed={type === t} onClick={() => setType(t)}>
            {TX_TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs text-muted">{type === "transfer" ? "移動元の口座" : "口座"}</span>
          <select name="account_id" value={accountId} onChange={(e) => onAccountChange(e.target.value)} className="field">
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">銘柄</span>
          <select name="asset_id" value={assetId} onChange={(e) => setAssetId(e.target.value)} className="field">
            {(type === "deposit" || type === "withdraw" || type === "fee") && <option value="">（なし）</option>}
            {(needsQty || type === "dividend" ? tradeAssets : assets).map((a) => (
              <option key={a.id} value={a.id}>
                {a.symbol}
              </option>
            ))}
          </select>
        </label>
      </div>

      {type === "transfer" && (
        <label className="block">
          <span className="mb-1 block text-xs text-muted">移動先の口座</span>
          <select name="transfer_account_id" className="field" value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
            <option value="" disabled>
              選んでください
            </option>
            {accounts
              .filter((a) => a.id !== accountId)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </label>
      )}

      {type !== "transfer" && (
        <label className="block">
          <span className="mb-1 block text-xs text-muted">
            {totalLabel}（{currency}）
          </span>
          <input
            inputMode="decimal"
            autoComplete="off"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            placeholder="0"
            className="field text-2xl font-semibold tabular-nums"
          />
        </label>
      )}

      {(needsQty || type === "fee") && (
        <label className="block">
          <span className="mb-1 block text-xs text-muted">
            数量{asset ? `（${asset.symbol}）` : ""}
            {type === "fee" && "　※数量で払った手数料（BTC の送金手数料など）のときだけ"}
          </span>
          <input
            name="quantity"
            inputMode="decimal"
            autoComplete="off"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0.00000000"
            className="field text-2xl font-semibold tabular-nums"
          />
        </label>
      )}

      {(type === "buy" || type === "sell") && (
        <div className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">単価（自動計算）</span>
            <span className="font-semibold tabular-nums">{derived ? formatMoney(derived, currency) : "—"}</span>
          </div>
          {currency !== "CAD" && (
            <div className="flex justify-between">
              <span className="text-muted">CAD 換算</span>
              <span className="tabular-nums">{fxRate > 0 ? formatMoney(cadTotal) : "—"}</span>
            </div>
          )}
        </div>
      )}

      {type === "transfer" && (
        <p className="text-xs text-muted">
          課税口座と TFSA/RRSP の間の移動は時価での処分とみなされます。その場合は「詳細」で時価の単価を入れてください。
        </p>
      )}

      <button type="button" className="text-sm text-accent" onClick={() => setShowDetails((s) => !s)}>
        {showDetails ? "詳細を閉じる" : "詳細（日付・手数料・通貨・メモ）"}
      </button>

      <div className={showDetails ? "space-y-3" : "hidden"}>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">日付</span>
            <input name="trade_date" type="date" value={tradeDate} onChange={(e) => setTradeDate(e.target.value)} className="field" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">通貨</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="field">
              <option>CAD</option>
              <option>USD</option>
            </select>
          </label>
        </div>
        {type !== "fee" && (
          <label className="block">
            <span className="mb-1 block text-xs text-muted">手数料（{currency}）</span>
            <input name="fee" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0" className="field" />
          </label>
        )}
        {(needsQty) && (
          <label className="block">
            <span className="mb-1 block text-xs text-muted">単価を直接入力（{type === "transfer" ? "時価" : "自動計算より優先"}）</span>
            <input inputMode="decimal" value={priceOverride} onChange={(e) => setPriceOverride(e.target.value)} placeholder="空欄なら自動" className="field" />
          </label>
        )}
        {currency !== "CAD" && (
          <label className="block">
            <span className="mb-1 block text-xs text-muted">
              為替（1 {currency} = ? CAD）{usdCad && currency === "USD" && `　Bank of Canada ${usdCad.date} の値`}
            </span>
            <input name="fx_rate" inputMode="decimal" value={fx} onChange={(e) => setFx(e.target.value)} className="field" />
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-xs text-muted">メモ</span>
          <input name="note" value={note} onChange={(e) => setNote(e.target.value)} className="field" />
        </label>
      </div>

      <FormMessage state={state} />
      <SubmitButton pendingText="記録中…">記録する</SubmitButton>
    </form>
  );
}
