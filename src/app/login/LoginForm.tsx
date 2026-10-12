"use client";
import { useActionState } from "react";
import { signIn, type ActionState } from "../actions";
import { FormMessage, SubmitButton } from "@/components/SubmitButton";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState<ActionState, FormData>(signIn, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="mb-1 block text-sm text-muted">メールアドレス</span>
        <input name="email" type="email" autoComplete="username" required className="field" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm text-muted">パスワード</span>
        <input name="password" type="password" autoComplete="current-password" required className="field" />
      </label>
      <FormMessage state={state} />
      <SubmitButton pendingText="ログイン中…">ログイン</SubmitButton>
    </form>
  );
}
