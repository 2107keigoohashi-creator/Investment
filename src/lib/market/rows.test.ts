import { describe, expect, it } from "vitest";
import { buildMarketRows } from "./rows";
import type { Asset } from "../types";

const asset = (id: string, extra: Partial<Asset> = {}): Asset => ({
  id,
  user_id: "u",
  symbol: id.toUpperCase(),
  name: id,
  asset_type: "stock",
  exchange: null,
  currency: "USD",
  price_source: "yahoo",
  source_id: null,
  category: "us_stock",
  is_active: true,
  ...extra,
});

describe("buildMarketRows", () => {
  it("銘柄の通貨の最新値・前日比・スパークラインを作る", () => {
    const rows = buildMarketRows(
      [asset("a"), asset("b", { is_active: false }), asset("c")],
      [
        { asset_id: "a", date: "2026-10-09", close: 100, currency: "USD", source: "yahoo" },
        { asset_id: "a", date: "2026-10-12", close: 110, currency: "USD", source: "yahoo" },
        { asset_id: "a", date: "2026-10-12", close: 150, currency: "CAD", source: "x" },
        { asset_id: "a", date: "2026-10-10", close: 105, currency: "USD", source: "yahoo" },
      ],
    );
    expect(rows.map((r) => r.id)).toEqual(["a", "c"]);
    expect(rows[0]).toMatchObject({ price: 110, date: "2026-10-12", spark: [100, 105, 110] });
    expect(rows[0].changePct).toBeCloseTo(4.7619, 3);
    expect(rows[1]).toMatchObject({ price: null, changePct: null, spark: [] });
  });
});
