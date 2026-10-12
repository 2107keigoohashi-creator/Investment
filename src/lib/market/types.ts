import type { PriceSource } from "../types";

/** 価格を取ってくる対象（assets の行から必要なものだけ） */
export interface AssetRef {
  id: string;
  symbol: string;
  /** 取得元での ID（CoinGecko の 'bitcoin'、Alpha Vantage の 'VFV.TRT' など）。なければ symbol を使う */
  source_id: string | null;
  currency: string;
}

export interface Quote {
  assetId: string;
  date: string;
  close: number;
  currency: string;
  source: string;
}

/**
 * 価格の取得元（adapter）。取得元を差し替えるときは、これを実装して registry に登録する。
 */
export interface PriceProvider {
  id: PriceSource;
  /** API キーなどがそろっていて使える状態か */
  isConfigured(): boolean;
  /** 最新の価格 */
  fetchLatest(assets: AssetRef[], today: string): Promise<Quote[]>;
  /** 過去の日次終値（取得元が対応していれば） */
  fetchHistory?(asset: AssetRef, days: number): Promise<Quote[]>;
}

export async function fetchJson<T>(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(init?.timeoutMs ?? 15_000),
  });
  if (!res.ok) {
    throw new Error(`${new URL(url).host} が ${res.status} を返しました`);
  }
  return (await res.json()) as T;
}

export function refId(a: AssetRef): string {
  return a.source_id || a.symbol;
}
