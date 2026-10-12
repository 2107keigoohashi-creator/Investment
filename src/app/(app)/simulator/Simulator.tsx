"use client";
import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { addDays } from "@/lib/calc/dates";
import { backtest, cagrPct, projectFuture } from "@/lib/calc/simulate";
import { formatMoney, formatPct, formatQty, signClass } from "@/lib/format";
import type { DcaFrequency } from "@/lib/types";

interface AssetOption {
  id: string;
  symbol: string;
  name: string;
}

const PERIODS = [
  { key: "1", label: "1年前", years: 1, range: "1y" },
  { key: "3", label: "3年前", years: 3, range: "5y" },
  { key: "5", label: "5年前", years: 5, range: "5y" },
  { key: "10", label: "10年前", years: 10, range: "10y" },
] as const;

const parse = (s: string) => {
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const tooltipStyle = {
  background: "var(--surface-solid)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  color: "var(--text)",
  fontSize: 12,
};

const kTick = (v: number) => (Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}K` : String(Math.round(v)));

export function Simulator({ assets, today }: { assets: AssetOption[]; today: string }) {
  const [tab, setTab] = useState<"past" | "future">("past");
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-2" role="group" aria-label="モード">
        <button type="button" className="chip py-2" aria-pressed={tab === "past"} onClick={() => setTab("past")}>
          過去で試す
        </button>
        <button type="button" className="chip py-2" aria-pressed={tab === "future"} onClick={() => setTab("future")}>
          将来を試算
        </button>
      </div>
      {tab === "past" ? <Backtest assets={assets} today={today} /> : <Projection />}
      <p className="mt-4 px-1 text-xs text-muted">
        仮定にもとづく計算です。手数料・税金・為替手数料は含みません。過去の結果や想定の利回りは、将来の成績を保証しません。
      </p>
    </>
  );
}

function Backtest({ assets, today }: { assets: AssetOption[]; today: string }) {
  const defaultAsset = assets.find((a) => a.symbol === "BTC") ?? assets[0];
  const [assetId, setAssetId] = useState(defaultAsset?.id ?? "");
  const [mode, setMode] = useState<"dca" | "lump">("dca");
  const [amount, setAmount] = useState("100");
  const [frequency, setFrequency] = useState<DcaFrequency>("monthly");
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["key"]>("3");
  const p = PERIODS.find((x) => x.key === period)!;
  const start = addDays(today, -Math.round(p.years * 365.25));
  const key = `${assetId}:${p.range}`;
  // 取ってきた履歴（どの銘柄・期間のものか key で覚えておく）
  const [loaded, setLoaded] = useState<{
    key: string;
    prices: { date: string; close: number }[];
    source: string;
    error: string | null;
  } | null>(null);
  const loading = Boolean(assetId) && loaded?.key !== key;
  const prices = loaded?.key === key ? loaded.prices : null;
  const source = loaded?.source ?? "";
  const error = loaded?.key === key ? loaded.error : null;

  useEffect(() => {
    if (!assetId) return;
    let cancelled = false;
    fetch(`/api/history?asset=${assetId}&range=${p.range}`)
      .then((r) => r.json())
      .then((d: { prices?: { date: string; close: number }[]; source?: string; error?: string }) => {
        if (!cancelled) setLoaded({ key, prices: d.prices ?? [], source: d.source ?? "", error: d.error ?? null });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ key, prices: [], source: "", error: "価格の履歴を取れませんでした" });
      });
    return () => {
      cancelled = true;
    };
  }, [assetId, p.range, key]);

  const result = useMemo(() => {
    if (!prices) return null;
    return backtest({
      prices,
      mode,
      amount: parse(amount),
      frequency,
      dayOfMonth: 1,
      dayOfWeek: 1,
      start,
      end: today,
    });
  }, [prices, mode, amount, frequency, start, today]);

  const asset = assets.find((a) => a.id === assetId);
  const coverageShort = prices && prices.length > 0 && prices[0].date > addDays(start, 30);

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4">
        <label className="block">
          <span className="mb-1 block text-xs text-muted">銘柄</span>
          <select value={assetId} onChange={(e) => setAssetId(e.target.value)} className="field">
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.symbol}（{a.name}）
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="chip py-2" aria-pressed={mode === "dca"} onClick={() => setMode("dca")}>
            積立
          </button>
          <button type="button" className="chip py-2" aria-pressed={mode === "lump"} onClick={() => setMode("lump")}>
            一括
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">{mode === "dca" ? "1 回の金額（CAD）" : "金額（CAD）"}</span>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="field" />
          </label>
          {mode === "dca" && (
            <label className="block">
              <span className="mb-1 block text-xs text-muted">頻度</span>
              <select value={frequency} onChange={(e) => setFrequency(e.target.value as DcaFrequency)} className="field">
                <option value="weekly">毎週（月曜）</option>
                <option value="biweekly">2 週ごと</option>
                <option value="monthly">毎月（1 日）</option>
              </select>
            </label>
          )}
        </div>
        <div>
          <span className="mb-1 block text-xs text-muted">いつから</span>
          <div className="flex gap-2">
            {PERIODS.map((x) => (
              <button key={x.key} type="button" className="chip" aria-pressed={period === x.key} onClick={() => setPeriod(x.key)}>
                {x.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && <p className="text-center text-sm text-muted">価格の履歴を読み込み中…</p>}
      {error && <p className="text-sm text-loss">{error}</p>}
      {!loading && prices && !result && <p className="text-center text-sm text-muted">この期間の価格データがありません。</p>}

      {result && !loading && (
        <>
          <section className="card p-4">
            <div className="text-sm text-muted">
              {asset?.symbol} を {result.firstDate} から{mode === "dca" ? `${result.purchases} 回積み立てた場合` : "一括で買った場合"}
            </div>
            <div className="mt-1 text-3xl font-bold tabular-nums">{formatMoney(result.value)}</div>
            <div className={`text-sm font-semibold tabular-nums ${signClass(result.gain)}`}>
              {result.gain >= 0 ? "+" : "−"}
              {formatMoney(Math.abs(result.gain))}（{formatPct(result.gainPct)}）
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <dt className="text-muted">投資した額</dt>
                <dd className="tabular-nums">{formatMoney(result.invested)}</dd>
              </div>
              <div>
                <dt className="text-muted">平均取得単価</dt>
                <dd className="tabular-nums">{formatMoney(result.avgCost)}</dd>
              </div>
              <div>
                <dt className="text-muted">数量</dt>
                <dd className="tabular-nums">{formatQty(result.units, 6)}</dd>
              </div>
              <div>
                <dt className="text-muted">途中の最大の下落</dt>
                <dd className="tabular-nums text-loss">−{result.maxDrawdownPct.toFixed(1)}%</dd>
              </div>
            </dl>
            {coverageShort && (
              <p className="mt-2 text-xs text-warn">この銘柄は {prices![0].date} からのデータしかないため、その日から計算しています。</p>
            )}
            {source === "db" && <p className="mt-2 text-xs text-warn">Yahoo Finance から取れなかったため、アプリに保存済みの価格で計算しています。</p>}
          </section>

          <section className="card p-4">
            <div className="mb-1 flex gap-4 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 rounded" style={{ background: "var(--accent)" }} />
                評価額
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: "var(--muted)" }} />
                投資した額
              </span>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={result.points} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--grid)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "var(--muted)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "var(--grid)" }}
                    tickFormatter={(d: string) => `${d.slice(2, 4)}/${Number(d.slice(5, 7))}`}
                    minTickGap={28}
                  />
                  <YAxis orientation="right" tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={false} width={48} tickFormatter={kTick} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: "var(--muted)" }}
                    formatter={(v, name) => [formatMoney(Number(v)), name === "value" ? "評価額" : "投資した額"]}
                  />
                  <Line type="monotone" dataKey="invested" stroke="var(--muted)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 4, stroke: "var(--surface-solid)", strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          {prices && cagrPct(prices.filter((x) => x.date >= start)) !== null && (
            <p className="px-1 text-xs text-muted">
              参考: この期間の {asset?.symbol} の年率（CAGR）は {formatPct(cagrPct(prices.filter((x) => x.date >= start)), 1)}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Projection() {
  const [initial, setInitial] = useState("0");
  const [monthly, setMonthly] = useState("200");
  const [rate, setRate] = useState("5");
  const [years, setYears] = useState("10");

  const points = useMemo(
    () =>
      projectFuture({
        initial: parse(initial),
        monthly: parse(monthly),
        annualRatePct: parse(rate),
        years: Math.min(50, Math.max(1, parse(years))),
      }),
    [initial, monthly, rate, years],
  );
  const last = points.at(-1)!;

  return (
    <div className="space-y-4">
      <div className="card grid grid-cols-2 gap-3 p-4">
        <label className="block">
          <span className="mb-1 block text-xs text-muted">最初に入れる額（CAD）</span>
          <input inputMode="decimal" value={initial} onChange={(e) => setInitial(e.target.value)} className="field" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">毎月の積立（CAD）</span>
          <input inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} className="field" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">想定の年利（%）</span>
          <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} className="field" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">年数</span>
          <input inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value)} className="field" />
        </label>
      </div>

      <section className="card p-4">
        <div className="text-sm text-muted">{last.year} 年後の試算</div>
        <div className="mt-1 text-3xl font-bold tabular-nums">{formatMoney(last.value)}</div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-muted">積み立てた合計</dt>
            <dd className="tabular-nums">{formatMoney(last.contributed)}</dd>
          </div>
          <div>
            <dt className="text-muted">増えた分（試算）</dt>
            <dd className={`tabular-nums ${signClass(last.value - last.contributed)}`}>{formatMoney(last.value - last.contributed)}</dd>
          </div>
        </dl>
        <div className="mt-3 h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="year" tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--grid)" }} tickFormatter={(y: number) => `${y}年`} />
              <YAxis orientation="right" tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={false} width={48} tickFormatter={kTick} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(y) => `${y} 年後`}
                formatter={(v, name) => [formatMoney(Number(v)), name === "value" ? "試算額" : "積み立てた合計"]}
              />
              <Line type="monotone" dataKey="contributed" stroke="var(--muted)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
