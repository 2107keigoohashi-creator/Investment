import "server-only";
import postgres from "postgres";
import { databaseUrl } from "./env";

/**
 * Postgres（Neon）への接続。
 * - numeric は number、date / timestamptz は文字列で受け取る
 * - Neon の pooled 接続（PgBouncer の transaction mode）向けに prepare: false
 */
function createSql() {
  return postgres(databaseUrl(), {
    prepare: false,
    max: 3,
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
    types: {
      numeric: { to: 1700, from: [1700], serialize: (x: unknown) => String(x), parse: (x: string) => Number(x) },
      date: { to: 1082, from: [1082], serialize: (x: unknown) => String(x), parse: (x: string) => x },
      timestamptz: { to: 1184, from: [1184], serialize: (x: unknown) => (x instanceof Date ? x.toISOString() : String(x)), parse: (x: string) => x },
    },
  });
}

type Sql = ReturnType<typeof createSql>;
const g = globalThis as unknown as { __maruSql?: Sql };

/** 所有者ロールでの接続（RLS をバイパス）。Cron とログイン確認だけで使う */
export function ownerSql(): Sql {
  if (!g.__maruSql) g.__maruSql = createSql();
  return g.__maruSql;
}

export type Tx = postgres.TransactionSql<Record<string, never>>;

/**
 * ログイン中のユーザーとしてクエリを流す。
 * トランザクション内で app.user_id を設定し、RLS がかかる maru_app ロールに切り替える。
 */
export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const result = await ownerSql().begin(async (tx) => {
    await tx`select set_config('app.user_id', ${userId}, true)`;
    await tx`set local role maru_app`;
    return fn(tx as unknown as Tx);
  });
  return result as T;
}
