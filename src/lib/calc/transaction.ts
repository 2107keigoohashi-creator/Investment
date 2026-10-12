import type { TransactionType } from "../types";

export interface TransactionInput {
  type: TransactionType;
  quantity: number;
  price: number;
  fee: number;
  /** 1 単位の取引通貨 = fxRate CAD（CAD 建てなら 1） */
  fxRate: number;
  /** deposit / withdraw / dividend / fee の金額（取引通貨） */
  amount?: number;
}

export interface TransactionAmounts {
  /** 取引通貨での総額（買い=支払総額、売り=受取額、入出金・配当=金額、手数料=手数料） */
  amount: number;
  amountCad: number;
  feeCad: number;
}

/** 取引通貨の金額を CAD に換算する（取引日の FX レートを使う） */
export function toCad(amount: number, fxRate: number): number {
  return amount * fxRate;
}

/**
 * 取引の総額と CAD 換算額を計算する。
 * - buy: 数量 × 単価 + 手数料（支払総額）
 * - sell: 数量 × 単価 − 手数料（受取額）
 * - deposit / withdraw / dividend: 入力された金額
 * - fee: 手数料
 * - transfer: 金額なし（手数料のみ）
 */
export function computeTransactionAmounts(input: TransactionInput): TransactionAmounts {
  const { type, quantity, price, fee, fxRate } = input;
  let amount: number;
  switch (type) {
    case "buy":
      amount = quantity * price + fee;
      break;
    case "sell":
      amount = quantity * price - fee;
      break;
    case "deposit":
    case "withdraw":
    case "dividend":
      amount = input.amount ?? quantity * price;
      break;
    case "fee":
      amount = fee || (input.amount ?? 0);
      break;
    case "transfer":
      amount = 0;
      break;
  }
  return {
    amount,
    amountCad: toCad(amount, fxRate),
    feeCad: toCad(type === "fee" ? amount : fee, fxRate),
  };
}

/**
 * 「数量 + 支払額」から単価を逆算する。
 * 支払額は手数料込みの総額とみなし、単価 = (支払額 − 手数料) / 数量。
 */
export function derivePriceFromTotal(quantity: number, total: number, fee = 0): number | null {
  if (!(quantity > 0) || !(total > 0)) return null;
  const net = total - fee;
  if (net < 0) return null;
  return net / quantity;
}

/**
 * 売却: 「数量 + 受取額」から単価を逆算する。
 * 受取額は手数料を引かれた後の金額とみなし、単価 = (受取額 + 手数料) / 数量。
 */
export function derivePriceFromProceeds(quantity: number, proceeds: number, fee = 0): number | null {
  if (!(quantity > 0) || !(proceeds > 0)) return null;
  return (proceeds + fee) / quantity;
}
