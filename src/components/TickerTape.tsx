import Link from "next/link";
import { formatPct } from "@/lib/format";
import type { MarketRow } from "@/lib/market/rows";

/** 画面上部を流れる銘柄のティッカー（タップで詳細へ） */
export function TickerTape({ rows }: { rows: MarketRow[] }) {
  const items = rows.filter((r) => r.price !== null);
  if (items.length === 0) return null;
  const fmt = (r: MarketRow) =>
    new Intl.NumberFormat("en-US", { maximumFractionDigits: r.price! >= 1000 ? 0 : 2, minimumFractionDigits: r.price! >= 1000 ? 0 : 2 }).format(r.price!);
  const list = (dup: boolean) =>
    items.map((r) => (
      <Link
        key={`${dup ? "d" : "a"}-${r.id}`}
        href={`/assets/${encodeURIComponent(r.symbol)}`}
        className="flex items-center gap-1.5 px-3 text-xs whitespace-nowrap"
        aria-hidden={dup || undefined}
        tabIndex={dup ? -1 : undefined}
      >
        <span className="font-semibold text-text">{r.symbol}</span>
        <span className="num text-muted">{fmt(r)}</span>
        <span className={`num ${r.changePct === null ? "text-muted" : r.changePct >= 0 ? "text-gain" : "text-loss"}`}>
          {r.changePct === null ? "" : `${r.changePct >= 0 ? "▲" : "▼"}${formatPct(Math.abs(r.changePct)).replace("+", "")}`}
        </span>
      </Link>
    ));
  return (
    <div
      className="ticker relative -mx-4 mb-4 overflow-hidden border-y border-border bg-[rgba(8,12,22,0.6)] py-2"
      style={{ maskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)" }}
    >
      <div className="ticker-track">
        {list(false)}
        {list(true)}
      </div>
    </div>
  );
}
