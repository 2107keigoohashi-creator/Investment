"use client";
import { useActionState } from "react";
import { refreshNewsNow, type ActionState } from "@/app/actions";

export function RefreshNewsButton() {
  const [state, action, pending] = useActionState<ActionState, FormData>(refreshNewsNow, {});
  return (
    <form action={action} className="flex items-center gap-2">
      {(state.ok || state.error) && <span className={`text-xs ${state.error ? "text-loss" : "text-muted"}`}>{state.error ?? state.ok}</span>}
      <button type="submit" className="btn px-3 py-1.5 text-sm" disabled={pending}>
        {pending ? "更新中…" : "更新"}
      </button>
    </form>
  );
}
