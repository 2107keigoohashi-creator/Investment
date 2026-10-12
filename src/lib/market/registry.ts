import type { PriceSource } from "../types";
import { alphavantage } from "./alphavantage";
import { coingecko } from "./coingecko";
import { finnhub } from "./finnhub";
import type { PriceProvider } from "./types";

/** price_source → adapter。取得元を増やすときはここに追加する */
const providers: Partial<Record<PriceSource, PriceProvider>> = {
  coingecko,
  finnhub,
  alphavantage,
};

export function getProvider(source: PriceSource): PriceProvider | null {
  return providers[source] ?? null;
}

/** 株・ETF の既定の取得元（環境変数 STOCK_PRICE_PROVIDER で切り替え） */
export function defaultStockSource(): PriceSource {
  const v = process.env.STOCK_PRICE_PROVIDER;
  return v === "alphavantage" ? "alphavantage" : "finnhub";
}
