"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { computeTransactionAmounts } from "@/lib/calc/transaction";
import { checkPassword, endSession, requireUser, startSession } from "@/lib/auth";
import { ownerSql, withUser, type Tx } from "@/lib/db";
import { runBackfill, runDailyFetch } from "@/lib/market/jobs";
import type { AccountType, AssetType, DcaFrequency, PriceSource, TransactionType } from "@/lib/types";

export interface ActionState {
  error?: string;
  ok?: string;
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const optStr = (fd: FormData, k: string) => str(fd, k) || null;
/** 「1,234.5」のようなカンマ入りも受け付ける */
const numOf = (fd: FormData, k: string) => {
  const v = str(fd, k).replace(/,/g, "");
  return v === "" ? 0 : Number(v);
};
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const isCurrency = (s: string) => /^[A-Z]{3}$/.test(s);

/** ログイン中のユーザーとして（RLS 付きで）書き込む */
async function asUser<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const { userId } = await requireUser();
  return withUser(userId, fn);
}

/** Postgres のエラーコード（23505 = 一意制約違反、23503 = 外部キー違反） */
function pgCode(e: unknown): string | undefined {
  return typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code) : undefined;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function revalidateAll() {
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// 認証
// ---------------------------------------------------------------------------

export async function signIn(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  const next = str(fd, "next");
  if (!email || !password) return { error: "メールアドレスとパスワードを入力してください" };
  const session = await checkPassword(email, password);
  if (!session) {
    // 総当たり対策に少し待つ
    await new Promise((r) => setTimeout(r, 800));
    return { error: "メールアドレスかパスワードが違います" };
  }
  await startSession(session);
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function signOut() {
  await endSession();
  redirect("/login");
}

// ---------------------------------------------------------------------------
// 取引
// ---------------------------------------------------------------------------

const TX_TYPES: TransactionType[] = ["buy", "sell", "deposit", "withdraw", "dividend", "fee", "transfer"];

export async function createTransaction(_: ActionState, fd: FormData): Promise<ActionState> {
  const type = str(fd, "type") as TransactionType;
  if (!TX_TYPES.includes(type)) return { error: "取引の種類が不正です" };

  const account_id = str(fd, "account_id");
  const asset_id = optStr(fd, "asset_id");
  const trade_date = str(fd, "trade_date");
  const currency = str(fd, "currency").toUpperCase() || "CAD";
  const quantity = numOf(fd, "quantity");
  const price = numOf(fd, "price");
  const fee = numOf(fd, "fee");
  const amountIn = numOf(fd, "amount");
  const fx_rate = currency === "CAD" ? 1 : numOf(fd, "fx_rate");
  const transfer_account_id = optStr(fd, "transfer_account_id");

  if (!account_id) return { error: "口座を選んでください" };
  if (!isDate(trade_date)) return { error: "日付が不正です" };
  if (!isCurrency(currency)) return { error: "通貨が不正です" };
  if (![quantity, price, fee, amountIn, fx_rate].every((n) => Number.isFinite(n) && n >= 0)) {
    return { error: "数値が不正です" };
  }
  if (!(fx_rate > 0)) return { error: `${currency}/CAD の為替レートを入力してください` };
  if (["buy", "sell", "transfer"].includes(type)) {
    if (!asset_id) return { error: "銘柄を選んでください" };
    if (!(quantity > 0)) return { error: "数量を入力してください" };
  }
  if ((type === "buy" || type === "sell") && !(price > 0)) return { error: "金額（または単価）を入力してください" };
  if (["deposit", "withdraw", "dividend"].includes(type) && !(amountIn > 0)) return { error: "金額を入力してください" };
  if (type === "fee" && !(fee > 0 || quantity > 0)) return { error: "手数料の金額か数量を入力してください" };
  if (type === "transfer") {
    if (!transfer_account_id) return { error: "移動先の口座を選んでください" };
    if (transfer_account_id === account_id) return { error: "移動元と移動先が同じです" };
  }

  const amounts = computeTransactionAmounts({ type, quantity, price, fee, fxRate: fx_rate, amount: amountIn });
  const row = {
    account_id,
    asset_id,
    type,
    trade_date,
    quantity,
    price,
    fee,
    currency,
    fx_rate,
    amount: amounts.amount,
    amount_cad: amounts.amountCad,
    fee_cad: amounts.feeCad,
    transfer_account_id: type === "transfer" ? transfer_account_id : null,
    note: optStr(fd, "note"),
  };
  try {
    await asUser((tx) => tx`insert into transactions ${tx(row)}`);
  } catch (e) {
    return { error: `保存できませんでした: ${message(e)}` };
  }
  revalidateAll();
  const back = str(fd, "redirect_to");
  redirect(back.startsWith("/") && !back.startsWith("//") ? back : "/");
}

export async function deleteTransaction(fd: FormData) {
  const id = str(fd, "id");
  if (id) await asUser((tx) => tx`delete from transactions where id = ${id}`);
  revalidateAll();
}

// ---------------------------------------------------------------------------
// 口座・銘柄
// ---------------------------------------------------------------------------

const ACCOUNT_TYPES: AccountType[] = ["tfsa", "rrsp", "fhsa", "non_registered", "exchange"];

export async function saveAccount(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = optStr(fd, "id");
  const name = str(fd, "name");
  const account_type = str(fd, "account_type") as AccountType;
  const currency = str(fd, "currency").toUpperCase() || "CAD";
  if (!name) return { error: "口座名を入力してください" };
  if (!ACCOUNT_TYPES.includes(account_type)) return { error: "口座の種類が不正です" };
  if (!isCurrency(currency)) return { error: "通貨が不正です" };
  const row = {
    name,
    institution: optStr(fd, "institution"),
    account_type,
    currency,
    // 編集フォームにはチェックボックスがある。新規は有効で作る
    is_active: id ? fd.get("is_active") === "on" : true,
  };
  try {
    await asUser((tx) =>
      id ? tx`update accounts set ${tx(row)} where id = ${id}` : tx`insert into accounts ${tx(row)}`,
    );
  } catch (e) {
    return { error: pgCode(e) === "23505" ? "同じ名前の口座があります" : message(e) };
  }
  revalidateAll();
  return { ok: id ? "口座を更新しました" : "口座を追加しました" };
}

export async function deleteAccount(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "id");
  try {
    await asUser((tx) => tx`delete from accounts where id = ${id}`);
  } catch (e) {
    return { error: pgCode(e) === "23503" ? "取引や積立ルールがある口座は削除できません（無効にしてください）" : message(e) };
  }
  revalidateAll();
  return { ok: "口座を削除しました" };
}

const ASSET_TYPES: AssetType[] = ["crypto", "stock", "etf", "cash"];
const PRICE_SOURCES: PriceSource[] = ["coingecko", "finnhub", "alphavantage", "manual"];

export async function saveAsset(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = optStr(fd, "id");
  const symbol = str(fd, "symbol").toUpperCase();
  const asset_type = str(fd, "asset_type") as AssetType;
  const price_source = (str(fd, "price_source") || "manual") as PriceSource;
  const currency = str(fd, "currency").toUpperCase() || "CAD";
  if (!symbol) return { error: "ティッカーを入力してください" };
  if (!ASSET_TYPES.includes(asset_type)) return { error: "種類が不正です" };
  if (!PRICE_SOURCES.includes(price_source)) return { error: "価格の取得元が不正です" };
  if (!isCurrency(currency)) return { error: "通貨が不正です" };
  const row = {
    symbol,
    name: str(fd, "name") || symbol,
    asset_type,
    exchange: optStr(fd, "exchange"),
    currency,
    price_source,
    source_id: optStr(fd, "source_id"),
  };
  try {
    await asUser((tx) =>
      id ? tx`update assets set ${tx(row)} where id = ${id}` : tx`insert into assets ${tx(row)}`,
    );
  } catch (e) {
    return { error: pgCode(e) === "23505" ? "同じティッカーの銘柄があります" : message(e) };
  }
  revalidateAll();
  return { ok: id ? "銘柄を更新しました" : "銘柄を追加しました" };
}

export async function addManualPrice(_: ActionState, fd: FormData): Promise<ActionState> {
  const asset_id = str(fd, "asset_id");
  const date = str(fd, "date");
  const close = numOf(fd, "close");
  const currency = str(fd, "currency").toUpperCase() || "CAD";
  if (!asset_id || !isDate(date) || !(close > 0) || !isCurrency(currency)) return { error: "入力が不正です" };
  try {
    await asUser(
      (tx) => tx`insert into prices (asset_id, date, close, currency, source)
        values (${asset_id}, ${date}, ${close}, ${currency}, 'manual')
        on conflict (user_id, asset_id, date, currency)
        do update set close = excluded.close, source = 'manual', fetched_at = now()`,
    );
  } catch (e) {
    return { error: message(e) };
  }
  revalidateAll();
  return { ok: "価格を保存しました" };
}

// ---------------------------------------------------------------------------
// 積立
// ---------------------------------------------------------------------------

const FREQUENCIES: DcaFrequency[] = ["daily", "weekly", "biweekly", "monthly"];

export async function saveDcaPlan(_: ActionState, fd: FormData): Promise<ActionState> {
  const frequency = str(fd, "frequency") as DcaFrequency;
  const amount = numOf(fd, "amount");
  const start_date = str(fd, "start_date");
  if (!str(fd, "asset_id") || !str(fd, "account_id")) return { error: "銘柄と口座を選んでください" };
  if (!FREQUENCIES.includes(frequency)) return { error: "頻度が不正です" };
  if (!(amount > 0)) return { error: "金額を入力してください" };
  if (!isDate(start_date)) return { error: "開始日が不正です" };
  const dow = str(fd, "day_of_week");
  const dom = str(fd, "day_of_month");
  const row = {
    asset_id: str(fd, "asset_id"),
    account_id: str(fd, "account_id"),
    amount,
    currency: str(fd, "currency").toUpperCase() || "CAD",
    frequency,
    day_of_week: frequency === "weekly" || frequency === "biweekly" ? (dow === "" ? null : Number(dow)) : null,
    day_of_month: frequency === "monthly" ? (dom === "" ? null : Math.min(31, Math.max(1, Number(dom)))) : null,
    start_date,
    note: optStr(fd, "note"),
  };
  try {
    await asUser((tx) => tx`insert into dca_plans ${tx(row)}`);
  } catch (e) {
    return { error: message(e) };
  }
  revalidateAll();
  return { ok: "積立ルールを追加しました" };
}

export async function toggleDcaPlan(fd: FormData) {
  const id = str(fd, "id");
  const active = str(fd, "is_active") === "true";
  await asUser((tx) => tx`update dca_plans set is_active = ${active} where id = ${id}`);
  revalidateAll();
}

export async function deleteDcaPlan(fd: FormData) {
  const id = str(fd, "id");
  await asUser((tx) => tx`delete from dca_plans where id = ${id}`);
  revalidateAll();
}

// ---------------------------------------------------------------------------
// データ取得（設定画面から手動実行。自分の分だけ）
// ---------------------------------------------------------------------------

export async function fetchNow(_: ActionState, fd: FormData): Promise<ActionState> {
  const { userId } = await requireUser();
  const mode = str(fd, "mode");
  // 自分の分だけ取得する（所有者ロールで書き込み）
  const results =
    mode === "backfill"
      ? await runBackfill(ownerSql(), { userId, days: 365 })
      : await runDailyFetch(ownerSql(), { userId });
  revalidateAll();
  const failed = results.filter((r) => !r.ok);
  const summary = results.map((r) => `${r.step}: ${r.ok ? `OK（${r.rows ?? 0}件）` : `失敗 – ${r.error}`}`).join("\n");
  return failed.length ? { error: summary } : { ok: summary };
}
