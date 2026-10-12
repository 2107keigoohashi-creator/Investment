import "server-only";
import { addDays, todayIn } from "../calc/dates";
import type { ownerSql } from "../db";
import type { PriceSource } from "../types";
import { fetchFearGreed } from "./feargreed";
import { fetchBocFx } from "./fx";
import { getProvider } from "./registry";
import type { AssetRef, Quote } from "./types";

/**
 * 毎朝のデータ取得。各ステップは独立して try/catch し、1 つ失敗しても他は続ける。
 * 失敗した場合は前回の値が DB に残るので、画面は「◯日前の値」として表示する。
 * 所有者ロール（RLS をバイパス）で全ユーザー分を書き込む。
 */

type Db = ReturnType<typeof ownerSql>;

export interface StepResult {
  step: string;
  ok: boolean;
  rows?: number;
  error?: string;
}

interface AssetRow extends AssetRef {
  user_id: string;
  price_source: PriceSource;
  asset_type: string;
}

const TZ = "America/Vancouver";

async function step(name: string, results: StepResult[], fn: () => Promise<number>) {
  try {
    const rows = await fn();
    results.push({ step: name, ok: true, rows });
  } catch (e) {
    results.push({ step: name, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}

async function loadAssets(db: Db, userId?: string): Promise<AssetRow[]> {
  return userId
    ? db<AssetRow[]>`select id, user_id, symbol, source_id, currency, price_source, asset_type from assets
        where is_active and asset_type <> 'cash' and user_id = ${userId}`
    : db<AssetRow[]>`select id, user_id, symbol, source_id, currency, price_source, asset_type from assets
        where is_active and asset_type <> 'cash'`;
}

async function loadUserIds(db: Db, userId?: string): Promise<string[]> {
  if (userId) return [userId];
  const rows = await db<{ id: string }[]>`select id from app_users`;
  return rows.map((r) => r.id);
}

async function upsertQuotes(db: Db, assets: AssetRow[], quotes: Quote[], keepExisting = false) {
  const owner = new Map(assets.map((a) => [a.id, a.user_id]));
  const rows = quotes
    .filter((q) => owner.has(q.assetId))
    .map((q) => ({
      user_id: owner.get(q.assetId)!,
      asset_id: q.assetId,
      date: q.date,
      close: q.close,
      currency: q.currency,
      source: q.source,
    }));
  if (rows.length === 0) return 0;
  // 過去データの取り込みでは、既にある行（手入力・seed・毎朝の取得分）を上書きしない
  if (keepExisting) {
    await db`insert into prices ${db(rows)} on conflict (user_id, asset_id, date, currency) do nothing`;
  } else {
    await db`insert into prices ${db(rows)} on conflict (user_id, asset_id, date, currency)
      do update set close = excluded.close, source = excluded.source, fetched_at = now()`;
  }
  return rows.length;
}

function groupBySource(assets: AssetRow[]) {
  const groups = new Map<PriceSource, AssetRow[]>();
  for (const a of assets) {
    if (a.price_source === "manual") continue;
    const arr = groups.get(a.price_source) ?? [];
    arr.push(a);
    groups.set(a.price_source, arr);
  }
  return groups;
}

async function fetchFx(db: Db, userIds: string[], opts: Parameters<typeof fetchBocFx>[1]) {
  const obs = await fetchBocFx("USD", opts);
  const rows = userIds.flatMap((user_id) => obs.map((o) => ({ user_id, ...o })));
  if (rows.length === 0) return 0;
  await db`insert into fx_rates ${db(rows)} on conflict (user_id, date, base, quote)
    do update set rate = excluded.rate, source = excluded.source, fetched_at = now()`;
  return rows.length;
}

async function fetchFng(db: Db, userIds: string[], limit: number) {
  const fg = await fetchFearGreed(limit);
  const rows = userIds.flatMap((user_id) =>
    fg.map((f) => ({ user_id, date: f.date, metric: "fear_greed", value: f.value, label: f.label, source: "alternative.me" })),
  );
  if (rows.length === 0) return 0;
  await db`insert into market_metrics ${db(rows)} on conflict (user_id, date, metric)
    do update set value = excluded.value, label = excluded.label, source = excluded.source, fetched_at = now()`;
  return rows.length;
}

/** 毎朝の取得（userId を渡すとその人の分だけ） */
export async function runDailyFetch(db: Db, opts: { userId?: string } = {}): Promise<StepResult[]> {
  const results: StepResult[] = [];
  const today = todayIn(TZ);
  let assets: AssetRow[] = [];
  let userIds: string[] = [];

  await step("assets", results, async () => {
    assets = await loadAssets(db, opts.userId);
    userIds = await loadUserIds(db, opts.userId);
    return assets.length;
  });

  for (const [source, group] of groupBySource(assets)) {
    await step(`prices:${source}`, results, async () => {
      const provider = getProvider(source);
      if (!provider) throw new Error(`取得元 ${source} は未対応です`);
      if (!provider.isConfigured()) throw new Error(`取得元 ${source} の API キーが設定されていません`);
      // 同じ取得元 ID の資産（複数ユーザー）はまとめて 1 回で取る
      const unique = [...new Map(group.map((a) => [a.source_id || a.symbol, a])).values()];
      const quotes = await provider.fetchLatest(unique, today);
      const expanded = group.flatMap((a) => {
        const rep = unique.find((u) => (u.source_id || u.symbol) === (a.source_id || a.symbol))!;
        return quotes.filter((q) => q.assetId === rep.id).map((q) => ({ ...q, assetId: a.id }));
      });
      return upsertQuotes(db, assets, expanded);
    });
  }

  await step("fx:USDCAD", results, () => fetchFx(db, userIds, { recent: 10 }));
  await step("fear_greed", results, () => fetchFng(db, userIds, 1));
  return results;
}

/** 過去データの取り込み（チャート用）。days 日分 */
export async function runBackfill(
  db: Db,
  opts: { userId?: string; days?: number } = {},
): Promise<StepResult[]> {
  const days = opts.days ?? 365;
  const results: StepResult[] = [];
  let assets: AssetRow[] = [];
  let userIds: string[] = [];

  await step("assets", results, async () => {
    assets = await loadAssets(db, opts.userId);
    userIds = await loadUserIds(db, opts.userId);
    return assets.length;
  });

  for (const a of assets) {
    const provider = getProvider(a.price_source);
    if (!provider?.fetchHistory) continue;
    await step(`history:${a.symbol}`, results, async () => {
      if (!provider.isConfigured()) throw new Error(`取得元 ${a.price_source} の API キーが設定されていません`);
      const quotes = await provider.fetchHistory!(a, days);
      return upsertQuotes(db, assets, quotes, true);
    });
  }

  const start = addDays(todayIn(TZ), -days);
  await step("fx:USDCAD", results, () => fetchFx(db, userIds, { startDate: start }));
  await step("fear_greed", results, () => fetchFng(db, userIds, Math.min(days, 365)));
  return results;
}
