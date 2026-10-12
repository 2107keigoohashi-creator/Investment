"use client";
import { useActionState } from "react";
import { addManualPrice, type ActionState } from "@/app/actions";
import { FormMessage, SubmitButton } from "@/components/SubmitButton";

export function ManualPriceForm({ assetId, defaultCurrency, today }: { assetId: string; defaultCurrency: string; today: string }) {
  const [state, action] = useActionState<ActionState, FormData>(addManualPrice, {});
  return (
    <form action={action} className="card space-y-2 p-4">
      <p className="text-xs text-muted">自動取得できない日や銘柄の終値を入れられます（同じ日・通貨は上書き）。</p>
      <input type="hidden" name="asset_id" value={assetId} />
      <div className="grid grid-cols-[1fr_1fr_5rem] gap-2">
        <input name="date" type="date" defaultValue={today} className="field" aria-label="日付" />
        <input name="close" inputMode="decimal" placeholder="終値" className="field" aria-label="終値" />
        <select name="currency" defaultValue={defaultCurrency} className="field" aria-label="通貨">
          <option>CAD</option>
          <option>USD</option>
        </select>
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn w-full">保存</SubmitButton>
    </form>
  );
}
