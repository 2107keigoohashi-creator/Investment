"use client";
import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingText = "保存中…",
  className = "btn btn-primary w-full",
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingText : children}
    </button>
  );
}

export function FormMessage({ state }: { state: { error?: string; ok?: string } }) {
  if (state.error) return <p role="alert" className="whitespace-pre-wrap text-sm text-loss">{state.error}</p>;
  if (state.ok) return <p role="status" className="whitespace-pre-wrap text-sm text-gain">{state.ok}</p>;
  return null;
}
