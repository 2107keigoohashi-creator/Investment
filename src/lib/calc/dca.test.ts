import { describe, expect, it } from "vitest";
import { compareDcaVsLumpSum, dcaDates, nextDcaDate } from "./dca";

describe("nextDcaDate", () => {
  it("daily", () => {
    expect(nextDcaDate({ frequency: "daily", day_of_week: null, day_of_month: null, start_date: "2026-10-01" }, "2026-10-12")).toBe("2026-10-12");
  });
  it("weekly（指定曜日）: 2026-10-12 は月曜、金曜(5) なら 10-16", () => {
    expect(nextDcaDate({ frequency: "weekly", day_of_week: 5, day_of_month: null, start_date: "2026-10-01" }, "2026-10-12")).toBe("2026-10-16");
    expect(nextDcaDate({ frequency: "weekly", day_of_week: 1, day_of_month: null, start_date: "2026-10-01" }, "2026-10-12")).toBe("2026-10-12");
  });
  it("biweekly は開始日を基準に 14 日ごと", () => {
    const plan = { frequency: "biweekly" as const, day_of_week: 5, day_of_month: null, start_date: "2026-10-02" };
    expect(nextDcaDate(plan, "2026-10-03")).toBe("2026-10-16");
    expect(nextDcaDate(plan, "2026-10-17")).toBe("2026-10-30");
  });
  it("monthly は月末を超える日を月末に寄せる", () => {
    const plan = { frequency: "monthly" as const, day_of_week: null, day_of_month: 31, start_date: "2026-01-01" };
    expect(nextDcaDate(plan, "2026-02-10")).toBe("2026-02-28");
    expect(nextDcaDate(plan, "2026-10-12")).toBe("2026-10-31");
  });
  it("開始日が未来なら開始日以降", () => {
    expect(nextDcaDate({ frequency: "monthly", day_of_week: null, day_of_month: 1, start_date: "2026-12-15" }, "2026-10-12")).toBe("2027-01-01");
  });
});

describe("compareDcaVsLumpSum", () => {
  it("積立と一括を比較する", () => {
    const plan = { frequency: "monthly" as const, day_of_week: null, day_of_month: 1, start_date: "2026-01-01" };
    expect(dcaDates(plan, "2026-03-15")).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
    const prices = [
      { date: "2026-01-01", close: 100 },
      { date: "2026-02-01", close: 50 },
      { date: "2026-03-01", close: 100 },
      { date: "2026-03-15", close: 120 },
    ];
    const r = compareDcaVsLumpSum(plan, 100, prices, "2026-03-15")!;
    expect(r.periods).toBe(3);
    expect(r.invested).toBe(300);
    expect(r.dca.units).toBeCloseTo(4);
    expect(r.dca.avgCost).toBeCloseTo(75);
    expect(r.dca.value).toBeCloseTo(480);
    expect(r.lumpSum.units).toBeCloseTo(3);
    expect(r.lumpSum.value).toBeCloseTo(360);
  });
  it("価格がなければ null", () => {
    expect(compareDcaVsLumpSum({ frequency: "daily", day_of_week: null, day_of_month: null, start_date: "2026-01-01" }, 10, [], "2026-01-05")).toBeNull();
  });
});
