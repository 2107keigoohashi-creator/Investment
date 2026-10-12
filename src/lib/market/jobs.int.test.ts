// DB を使う結合テスト。TEST_DATABASE_URL（所有者ロール）があるときだけ動く
//   TEST_DATABASE_URL=postgres://... npm test
import postgres from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("runDailyFetch / runBackfill（DB）", async () => {
  vi.stubEnv("DATABASE_URL", url ?? "");
  const { ownerSql } = await import("../db");
  const { runBackfill, runDailyFetch } = await import("./jobs");
  const db = ownerSql();
  const email = `jobtest-${Date.now()}@example.com`;
  const [user] = await db<{ id: string }[]>`
    insert into app_users (email, password_hash) values (${email}, crypt('x', gen_salt('bf', 4))) returning id`;

  afterAll(async () => {
    await db`delete from app_users where id = ${user.id}`;
    vi.unstubAllGlobals();
    await db.end();
  });

  function route(map: Record<string, unknown>) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        const hit = Object.entries(map).find(([k]) => String(input).includes(k));
        if (!hit) return new Response("{}", { status: 500 });
        return new Response(JSON.stringify(hit[1]), { status: 200 });
      }),
    );
  }

  it("価格・為替・恐怖強欲指数を保存し、失敗したステップだけ ok=false になる", async () => {
    route({
      "simple/price": { bitcoin: { cad: 120000, usd: 84000 } },
      "valet/observations": { observations: [{ d: "2026-10-09", FXUSDCAD: { v: "1.37" } }] },
      // fng は 500 を返す
    });
    const results = await runDailyFetch(db, { userId: user.id });
    const byStep = Object.fromEntries(results.map((r) => [r.step, r]));
    expect(byStep["prices:coingecko"]).toMatchObject({ ok: true, rows: 2 });
    expect(byStep["fx:USDCAD"]).toMatchObject({ ok: true, rows: 1 });
    expect(byStep["fear_greed"].ok).toBe(false);

    const prices = await db`select currency, close from prices where user_id = ${user.id} and source = 'coingecko' order by currency`;
    expect(prices.map((p) => [p.currency, Number(p.close)])).toEqual([["CAD", 120000], ["USD", 84000]]);

    // 2 回目は上書き（重複しない）
    route({ "simple/price": { bitcoin: { cad: 121000, usd: 85000 } } });
    await runDailyFetch(db, { userId: user.id });
    const again = await db`select close from prices where user_id = ${user.id} and source = 'coingecko' and currency = 'CAD'`;
    expect(again.map((p) => Number(p.close))).toEqual([121000]);
  });

  it("過去データの取り込みは既存の行（seed）を上書きしない", async () => {
    route({
      market_chart: { prices: [[Date.UTC(2026, 9, 9), 1], [Date.UTC(2026, 9, 8), 2]] },
      "valet/observations": { observations: [] },
      fng: { data: [] },
    });
    await runBackfill(db, { userId: user.id, days: 3 });
    const rows = await db`select date, close, source from prices
      where user_id = ${user.id} and currency = 'CAD' and date in ('2026-10-08', '2026-10-09') order by date`;
    expect(rows.map((r) => [r.date, Number(r.close), r.source])).toEqual([
      ["2026-10-08", 2, "coingecko"],
      ["2026-10-09", 118202, "seed"],
    ]);
  });
});
