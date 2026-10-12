"use client";
import { useActionState } from "react";
import { deleteAccount, fetchNow, saveAccount, saveAsset, type ActionState } from "@/app/actions";
import { FormMessage, SubmitButton } from "@/components/SubmitButton";
import { ACCOUNT_TYPE_LABEL, ASSET_TYPE_LABEL } from "@/lib/format";
import type { Account, Asset } from "@/lib/types";

export function AccountForm({ account }: { account?: Account }) {
  const [state, action] = useActionState<ActionState, FormData>(saveAccount, {});
  const [delState, delAction] = useActionState<ActionState, FormData>(deleteAccount, {});
  return (
    <details className="card p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between">
        {account ? (
          <span>
            <span className={`font-semibold ${account.is_active ? "" : "text-muted line-through"}`}>{account.name}</span>
            <span className="ml-2 text-xs text-muted">
              {ACCOUNT_TYPE_LABEL[account.account_type]} · {account.currency}
            </span>
          </span>
        ) : (
          <span className="font-semibold text-accent">＋ 口座を追加</span>
        )}
        <span className="text-muted">›</span>
      </summary>
      <form action={action} className="mt-3 space-y-2">
        {account && <input type="hidden" name="id" value={account.id} />}
        <input name="name" defaultValue={account?.name} placeholder="口座名（例: Wealthsimple TFSA）" className="field" />
        <input name="institution" defaultValue={account?.institution ?? ""} placeholder="金融機関（任意）" className="field" />
        <div className="grid grid-cols-[1fr_6rem] gap-2">
          <select name="account_type" defaultValue={account?.account_type ?? "exchange"} className="field" aria-label="口座の種類">
            {Object.entries(ACCOUNT_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select name="currency" defaultValue={account?.currency ?? "CAD"} className="field" aria-label="通貨">
            <option>CAD</option>
            <option>USD</option>
          </select>
        </div>
        {account && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_active" defaultChecked={account.is_active} /> 有効
          </label>
        )}
        <FormMessage state={state} />
        <SubmitButton className="btn btn-primary w-full">{account ? "保存" : "追加"}</SubmitButton>
      </form>
      {account && (
        <form action={delAction} className="mt-2 text-right">
          <input type="hidden" name="id" value={account.id} />
          <FormMessage state={delState} />
          <button type="submit" className="text-xs text-loss">口座を削除</button>
        </form>
      )}
    </details>
  );
}

export function AssetForm({ asset }: { asset?: Asset }) {
  const [state, action] = useActionState<ActionState, FormData>(saveAsset, {});
  return (
    <details className="card p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between">
        {asset ? (
          <span>
            <span className="font-semibold">{asset.symbol}</span>
            <span className="ml-2 text-xs text-muted">
              {ASSET_TYPE_LABEL[asset.asset_type]} · {asset.currency} · {asset.price_source}
            </span>
          </span>
        ) : (
          <span className="font-semibold text-accent">＋ 銘柄を追加</span>
        )}
        <span className="text-muted">›</span>
      </summary>
      <form action={action} className="mt-3 space-y-2">
        {asset && <input type="hidden" name="id" value={asset.id} />}
        <div className="grid grid-cols-2 gap-2">
          <input name="symbol" defaultValue={asset?.symbol} placeholder="ティッカー（VFV.TO）" className="field" />
          <input name="name" defaultValue={asset?.name} placeholder="名前" className="field" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <select name="asset_type" defaultValue={asset?.asset_type ?? "etf"} className="field" aria-label="種類">
            {Object.entries(ASSET_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <input name="exchange" defaultValue={asset?.exchange ?? ""} placeholder="取引所（TSX）" className="field" />
          <select name="currency" defaultValue={asset?.currency ?? "CAD"} className="field" aria-label="通貨">
            <option>CAD</option>
            <option>USD</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select name="price_source" defaultValue={asset?.price_source ?? "yahoo"} className="field" aria-label="価格の取得元">
            <option value="coingecko">CoinGecko</option>
            <option value="yahoo">Yahoo Finance（キー不要）</option>
            <option value="finnhub">Finnhub</option>
            <option value="alphavantage">Alpha Vantage</option>
            <option value="manual">手入力</option>
          </select>
          <input name="source_id" defaultValue={asset?.source_id ?? ""} placeholder="取得元での ID（任意）" className="field" />
        </div>
        <p className="text-xs text-muted">
          取得元での ID の例: CoinGecko は「bitcoin」、Alpha Vantage の TSX は「VFV.TRT」。空欄ならティッカーを使います。
        </p>
        <FormMessage state={state} />
        <SubmitButton className="btn btn-primary w-full">{asset ? "保存" : "追加"}</SubmitButton>
      </form>
    </details>
  );
}

export function FetchButtons() {
  const [state, action] = useActionState<ActionState, FormData>(fetchNow, {});
  return (
    <form action={action} className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <SubmitButton className="btn w-full text-sm" pendingText="取得中…">
          <span>今すぐ価格を取得</span>
        </SubmitButton>
        <button type="submit" name="mode" value="backfill" className="btn w-full text-sm">
          過去の価格を取り込む
        </button>
      </div>
      <p className="text-xs text-muted">毎朝 6:30（バンクーバー時間）に自動で取得しています。過去の取り込みは 1 年分です。</p>
      <FormMessage state={state} />
    </form>
  );
}
