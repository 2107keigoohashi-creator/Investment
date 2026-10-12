"use client";
import { useActionState, useState } from "react";
import { saveDcaPlan, type ActionState } from "@/app/actions";
import { FormMessage, SubmitButton } from "@/components/SubmitButton";
import { FREQUENCY_LABEL, WEEKDAY_LABEL } from "@/lib/format";
import type { Account, Asset, DcaFrequency } from "@/lib/types";

export function DcaForm({ assets, accounts, today }: { assets: Asset[]; accounts: Account[]; today: string }) {
  const [state, action] = useActionState<ActionState, FormData>(saveDcaPlan, {});
  const [freq, setFreq] = useState<DcaFrequency>("weekly");
  return (
    <form action={action} className="card space-y-3 p-4">
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className="mb-1 block text-xs text-muted">銘柄</span>
          <select name="asset_id" className="field">
            {assets.map((a) => (
              <option key={a.id} value={a.id}>{a.symbol}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted">口座</span>
          <select name="account_id" className="field">
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <label>
          <span className="mb-1 block text-xs text-muted">1 回の金額</span>
          <input name="amount" inputMode="decimal" placeholder="50" className="field" />
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted">通貨</span>
          <select name="currency" className="field">
            <option>CAD</option>
            <option>USD</option>
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className="mb-1 block text-xs text-muted">頻度</span>
          <select name="frequency" value={freq} onChange={(e) => setFreq(e.target.value as DcaFrequency)} className="field">
            {Object.entries(FREQUENCY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        {(freq === "weekly" || freq === "biweekly") && (
          <label>
            <span className="mb-1 block text-xs text-muted">曜日</span>
            <select name="day_of_week" defaultValue="1" className="field">
              {WEEKDAY_LABEL.map((w, i) => (
                <option key={i} value={i}>{w}曜</option>
              ))}
            </select>
          </label>
        )}
        {freq === "monthly" && (
          <label>
            <span className="mb-1 block text-xs text-muted">日</span>
            <input name="day_of_month" type="number" min={1} max={31} defaultValue={1} className="field" />
          </label>
        )}
      </div>
      <label className="block">
        <span className="mb-1 block text-xs text-muted">開始日</span>
        <input name="start_date" type="date" defaultValue={today} className="field" />
      </label>
      <FormMessage state={state} />
      <SubmitButton>追加</SubmitButton>
    </form>
  );
}
