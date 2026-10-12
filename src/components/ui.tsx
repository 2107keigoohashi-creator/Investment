import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({ title, back, action }: { title: string; back?: string; action?: ReactNode }) {
  return (
    <header className="mb-4 flex items-center gap-2 pt-2">
      {back && (
        <Link href={back} aria-label="戻る" className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-muted">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
      )}
      <h1 className="flex-1 text-xl font-bold">{title}</h1>
      {action}
    </header>
  );
}

export function Section({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-5">
      {(title || action) && (
        <div className="mb-2 flex items-baseline justify-between px-1">
          {title && <h2 className="text-sm font-semibold text-muted">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function StaleBadge({ label }: { label: string | null }) {
  if (!label) return null;
  return <span className="ml-1 rounded-md bg-warn-bg px-1.5 py-0.5 text-[11px] font-medium text-warn">{label}</span>;
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" }) {
  return (
    <div className={`rounded-xl px-3 py-2 text-sm ${tone === "warn" ? "bg-warn-bg text-warn" : "bg-surface-2 text-muted"}`}>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="card px-4 py-6 text-center text-sm text-muted">{children}</div>;
}
