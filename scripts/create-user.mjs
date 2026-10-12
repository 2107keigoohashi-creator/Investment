// ログインユーザーを作る / パスワードを変える
//   DATABASE_URL=... node scripts/create-user.mjs you@example.com 'password'
// 作成すると、トリガーで初期データ（BTC・口座・初期価格・初期レポート）が入る。
import postgres from "postgres";

const [email, password] = process.argv.slice(2);
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url || !email || !password) {
  console.error("使い方: DATABASE_URL=... node scripts/create-user.mjs <email> <password>");
  process.exit(1);
}
if (password.length < 10) {
  console.error("パスワードは 10 文字以上にしてください");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  const [row] = await sql`
    insert into app_users (email, password_hash)
    values (${email.toLowerCase()}, crypt(${password}, gen_salt('bf', 10)))
    on conflict (email) do update set password_hash = excluded.password_hash
    returning id, (xmax = 0) as created`;
  console.log(row.created ? `作成しました: ${row.id}` : `パスワードを更新しました: ${row.id}`);
} finally {
  await sql.end();
}
