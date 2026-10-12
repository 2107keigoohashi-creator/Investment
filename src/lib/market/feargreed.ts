import { formatDate } from "../calc/dates";
import { fetchJson } from "./types";

// alternative.me Crypto Fear & Greed Index（キー不要）
const URL = "https://api.alternative.me/fng/";

export interface FearGreed {
  date: string;
  value: number;
  label: string;
}

export async function fetchFearGreed(limit = 1): Promise<FearGreed[]> {
  const data = await fetchJson<{ data?: { value: string; value_classification: string; timestamp: string }[] }>(
    `${URL}?limit=${limit}`,
  );
  return (data.data ?? [])
    .map((d) => ({
      date: formatDate(new Date(Number(d.timestamp) * 1000)),
      value: Number(d.value),
      label: d.value_classification,
    }))
    .filter((d) => Number.isFinite(d.value));
}
