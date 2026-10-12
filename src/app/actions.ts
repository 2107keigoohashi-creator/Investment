"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { computeTransactionAmounts } from "@/lib/calc/transaction";
import { allowedEmails } from "@/lib/env";
import { runBackfill, runDailyFetch } from "@/lib/market/jobs";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
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

async function userClient() {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");
  return { db, userId };
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
  const allowed = allowedEmails();
  if (allowed.length > 0 && !allowed.includes(email)) {
    return { error: "このメールアドレスではログインできません" };
  }
  const db = await createClient();
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) return { error: "メールアドレスかパスワードが違います" };
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function signOut() {
  const db = await createClient();
  await db.auth.signOut();
  redirect("/login");
}

// ---------------------------------------------------------------------------
// 取引
// ---------------------------------------------------------------------------

const TX_TYPES: TransactionType[] = ["buy", "sell", "deposit", "withdraw", "dividend", "fee", "transfer"];

export async function createTransaction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { db } = await userClient();
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
  const { error } = await db.from("transactions").insert({
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
  });
  if (error) return { error: `保存できませんでした: ${error.message}` };
  revalidateAll();
  const back = str(fd, "redirect_to");
  redirect(back.startsWith("/") && !back.startsWith("//") ? back : "/");
}

export async function deleteTransaction(fd: FormData) {
  const { db } = await userClient();
  const id = str(fd, "id");
  if (id) await db.from("transactions").delete().eq("id", id);
  revalidateAll();
}

// ---------------------------------------------------------------------------
// 口座・銘柄
// ---------------------------------------------------------------------------

const ACCOUNT_TYPES: AccountType[] = ["tfsa", "rrsp", "fhsa", "non_registered", "exchange"];

export async function saveAccount(_: ActionState, fd: FormData): Promise<ActionState> {
  const { db } = await userClient();
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
  const { error } = id ? await db.from("accounts").update(row).eq("id", id) : await db.from("accounts").insert(row);
  if (error) return { error: error.code === "23505" ? "同じ名前の口座があります" : error.message };
  revalidateAll();
  return { ok: id ? "口座を更新しました" : "口座を追加しました" };
}

export async function deleteAccount(_: ActionState, fd: FormData): Promise<ActionState> {
  const { db } = await userClient();
  const { error } = await db.from("accounts").delete().eq("id", str(fd, "id"));
  if (error) {
    return { error: error.code === "23503" ? "取引がある口座は削除できません（無効にしてください）" : error.message };
  }
  revalidateAll();
  return { ok: "口座を削除しました" };
}

const ASSET_TYPES: AssetType[] = ["crypto", "stock", "etf", "cash"];
const PRICE_SOURCES: PriceSource[] = ["coingecko", "finnhub", "alphavantage", "manual"];

export async function saveAsset(_: ActionState, fd: FormData): Promise<ActionState> {
  const { db } = await userClient();
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
  const { error } = id ? await db.from("assets").update(row).eq("id", id) : await db.from("assets").insert(row);
  if (error) return { error: error.code === "23505" ? "同じティッカーの銘柄があります" : error.message };
  revalidateAll();
  return { ok: id ? "銘柄を更新しました" : "銘柄を追加しました" };
}

export async function addManualPrice(_: ActionState, fd: FormData): Promise<ActionState> {
  const { db } = await userClient();
  const asset_id = str(fd, "asset_id");
  const date = str(fd, "date");
  const close = numOf(fd, "close");
  const currency = str(fd, "currency").toUpperCase() || "CAD";
  if (!asset_id || !isDate(date) || !(close > 0) || !isCurrency(currency)) return { error: "入力が不正です" };
  const { error } = await db
    .from("prices")
    .upsert({ asset_id, date, close, currency, source: "manual" }, { onConflict: "user_id,asset_id,date,currency" });
  if (error) return { error: error.message };
  revalidateAll();
  return { ok: "価格を保存しました" };
}

// ---------------------------------------------------------------------------
// 積立
// ---------------------------------------------------------------------------

const FREQUENCIES: DcaFrequency[] = ["daily", "weekly", "biweekly", "monthly"];

export async function saveDcaPlan(_: ActionState, fd: FormData): Promise<ActionState> {
  const { db } = await userClient();
  const frequency = str(fd, "frequency") as DcaFrequency;
  const amount = numOf(fd, "amount");
  const start_date = str(fd, "start_date");
  if (!str(fd, "asset_id") || !str(fd, "account_id")) return { error: "銘柄と口座を選んでください" };
  if (!FREQUENCIES.includes(frequency)) return { error: "頻度が不正です" };
  if (!(amount > 0)) return { error: "金額を入力してください" };
  if (!isDate(start_date)) return { error: "開始日が不正です" };
  const dow = str(fd, "day_of_week");
  const dom = str(fd, "day_of_month");
  const { error } = await db.from("dca_plans").insert({
    asset_id: str(fd, "asset_id"),
    account_id: str(fd, "account_id"),
    amount,
    currency: str(fd, "currency").toUpperCase() || "CAD",
    frequency,
    day_of_week: frequency === "weekly" || frequency === "biweekly" ? (dow === "" ? null : Number(dow)) : null,
    day_of_month: frequency === "monthly" ? (dom === "" ? null : Math.min(31, Math.max(1, Number(dom)))) : null,
    start_date,
    note: optStr(fd, "note"),
  });
  if (error) return { error: error.message };
  revalidateAll();
  return { ok: "積立ルールを追加しました" };
}

export async function toggleDcaPlan(fd: FormData) {
  const { db } = await userClient();
  await db.from("dca_plans").update({ is_active: str(fd, "is_active") === "true" }).eq("id", str(fd, "id"));
  revalidateAll();
}

export async function deleteDcaPlan(fd: FormData) {
  const { db } = await userClient();
  await db.from("dca_plans").delete().eq("id", str(fd, "id"));
  revalidateAll();
}

// ---------------------------------------------------------------------------
// データ取得（設定画面から手動実行。自分の分だけ）
// ---------------------------------------------------------------------------

export async function fetchNow(_: ActionState, fd: FormData): Promise<ActionState> {
  const { userId } = await userClient();
  const mode = str(fd, "mode");
  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  const results =
    mode === "backfill" ? await runBackfill(admin, { userId, days: 365 }) : await runDailyFetch(admin, { userId });
  revalidateAll();
  const failed = results.filter((r) => !r.ok);
  const summary = results.map((r) => `${r.step}: ${r.ok ? `OK（${r.rows ?? 0}件）` : `失敗 – ${r.error}`}`).join("\n");
  return failed.length ? { error: summary } : { ok: summary };
}
