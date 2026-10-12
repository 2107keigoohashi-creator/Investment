"use client";
import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { addWatch, type ActionState } from "@/app/actions";
import { LiveBadge } from "@/components/LiveRefresher";
import { Sparkline } from "@/components/Sparkline";
import { FormMessage } from "@/components/SubmitButton";
import { formatMoney, formatPct, signClass, staleLabel } from "@/lib/format";
import type { MarketRow } from "@/lib/market/rows";

const TABS = [
  { key: "btc", label: "ビットコイン関連", cats: ["crypto", "btc_etf", "btc_stock"] },
  { key: "us", label: "米国株", cats: ["us_stock"] },
  { key: "ca", label: "カナダ株", cats: ["ca_stock"] },
  { key: "etf", label: "ETF・指数", cats: ["index_etf"] },
  { key: "other", label: "その他", cats: ["other"] },
  { key: "all", label: "すべて", cats: [] as string[] },
] as const;

const GROUP_LABEL: Record<string, string> = {
  crypto: "暗号資産",
  btc_etf: "ビットコイン ETF",
  btc_stock: "ビットコイン関連株",
  us_stock: "米国株",
  ca_stock: "カナダ株",
  index_etf: "ETF・指数",
  other: "その他",
};

const POLL_MS = 60_000;

type LivePatch = Pick<MarketRow, "price" | "currency" | "changePct" | "date"> & {
  /** 前回の表示から上がったか下がったか（光らせる用） */
  dir: 1 | -1 | 0;
  /** 更新の回数（アニメーションを毎回やり直すための key） */
  n: number;
};

export function MarketBoard({ rows: initial, today }: { rows: MarketRow[]; today: string }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("btc");
  // サーバーから来た値に、リアルタイムで取れた値を上書きして表示する
  const [live, setLive] = useState<Record<string, LivePatch>>({});
  const rows = useMemo(() => initial.map((r) => (live[r.id] ? { ...r, ...live[r.id] } : r)), [initial, live]);
  const [at, setAt] = useState<Date | null>(null);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);

  const visible = useMemo(() => {
    const t = TABS.find((x) => x.key === tab)!;
    return t.cats.length === 0 ? rows : rows.filter((r) => (t.cats as readonly string[]).includes(r.category));
  }, [rows, tab]);
  const idsKey = visible.map((r) => r.id).join(",");

  // 表示中の銘柄だけリアルタイムで取る（Yahoo / CoinGecko への負担を減らす）
  useEffect(() => {
    if (!idsKey) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === "visible" && !busy.current) {
        busy.current = true;
        try {
          const res = await fetch(`/api/live?ids=${idsKey}`, { cache: "no-store" });
          if (!res.ok) throw new Error(String(res.status));
          const data: {
            quotes: { assetId: string; price: number; currency: string; changePct: number | null; date: string }[];
            missing: string[];
          } = await res.json();
          if (data.quotes.length === 0 && data.missing.length > 0) throw new Error("no quotes");
          setLive((prev) => {
            const next = { ...prev };
            for (const q of data.quotes) {
              const before = prev[q.assetId]?.price ?? initial.find((r) => r.id === q.assetId)?.price ?? null;
              const dir = before === null || before === q.price ? 0 : q.price > before ? 1 : -1;
              next[q.assetId] = {
                price: q.price,
                currency: q.currency,
                changePct: q.changePct ?? prev[q.assetId]?.changePct ?? null,
                date: q.date,
                dir,
                n: (prev[q.assetId]?.n ?? 0) + 1,
              };
            }
            return next;
          });
          setAt(new Date());
          setFailed(false);
        } catch {
          setFailed(true);
        } finally {
          busy.current = false;
        }
      }
      timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, 300);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
    // initial は新しいサーバー描画のたびに変わるが、ポーリングはやり直さない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const groups = useMemo(() => {
    const m = new Map<string, MarketRow[]>();
    for (const r of visible) m.set(r.category, [...(m.get(r.category) ?? []), r]);
    return [...m];
  }, [visible]);

  return (
    <>
      <header className="mb-3 flex items-baseline justify-between">
        <h1 className="text-xl font-bold tracking-tight">マーケット</h1>
        <LiveBadge at={at} failed={failed} />
      </header>

      <SearchBox />

      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="カテゴリ">
        {TABS.map((t) => (
          <button key={t.key} type="button" className="chip" aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {groups.length === 0 && <p className="card px-4 py-6 text-center text-sm text-muted">このカテゴリの銘柄はまだありません。上の検索から追加できます。</p>}

      {groups.map(([cat, list]) => (
        <section key={cat} className="mb-5">
          <h2 className="label mb-2 px-1">{GROUP_LABEL[cat] ?? cat}</h2>
          <ul className="card divide-y divide-border">
            {list.map((r) => {
              const lv = live[r.id];
              const flash = lv && lv.dir !== 0 ? (lv.dir > 0 ? "flash-up" : "flash-down") : "";
              return (
              <li key={r.id}>
                <Link href={`/assets/${encodeURIComponent(r.symbol)}`} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold tracking-tight">{r.symbol}</div>
                    <div className="truncate text-xs text-muted">{r.name}</div>
                  </div>
                  <Sparkline values={r.price !== null && r.spark.at(-1) !== r.price ? [...r.spark, r.price] : r.spark} />
                  <div className="w-28 text-right">
                    <div key={lv?.n ?? 0} className={`font-semibold tabular-nums ${flash}`}>
                      {r.price !== null ? formatMoney(r.price, r.currency, r.price >= 1000 ? 0 : 2) : "—"}
                    </div>
                    <div className="text-xs tabular-nums">
                      <span className={signClass(r.changePct)}>{formatPct(r.changePct)}</span>
                      {r.date && staleLabel(r.date, today) && (
                        <span className="ml-1 text-muted">{staleLabel(r.date, today)}</span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
              );
            })}
          </ul>
        </section>
      ))}

      <p className="mt-2 px-1 text-xs text-muted">
        価格: 暗号資産は CoinGecko、株・ETF は Yahoo Finance（TSX などは最大 15 分遅れの場合あり）。表示中の銘柄を 1 分ごとに更新します。
      </p>
    </>
  );
}

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string | null;
  type: "stock" | "etf" | "crypto";
}

function SearchBox() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(addWatch, {});

  const term = q.trim();
  const shown = term ? results : [];

  useEffect(() => {
    if (!term) return;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const data: { results: SearchResult[] } = await res.json();
        setResults(data.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [term]);

  return (
    <div className="mb-3">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="銘柄を検索して追加（例: VFV、Shopify、bitcoin）"
        className="field"
        aria-label="銘柄を検索"
      />
      <FormMessage state={state} />
      {term && (shown.length > 0 || loading) && (
        <ul className="card mt-2 divide-y divide-border">
          {loading && <li className="px-4 py-2 text-sm text-muted">検索中…</li>}
          {shown.map((r) => (
            <li key={r.symbol} className="flex items-center gap-3 px-4 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{r.symbol}</div>
                <div className="truncate text-xs text-muted">
                  {r.name}
                  {r.exchange ? ` · ${r.exchange}` : ""}
                </div>
              </div>
              <form action={action} onSubmit={() => setTimeout(() => setQ(""), 0)}>
                <input type="hidden" name="symbol" value={r.symbol} />
                <input type="hidden" name="name" value={r.name} />
                <input type="hidden" name="type" value={r.type} />
                <input type="hidden" name="exchange" value={r.exchange ?? ""} />
                <button type="submit" className="btn px-3 py-1.5 text-sm" disabled={pending}>
                  {pending ? "追加中…" : "追加"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
