import { ENV_KEYS } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function SetupPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="mb-2 text-xl font-bold">セットアップが必要です</h1>
      <p className="mb-4 text-sm text-muted">
        Supabase の環境変数が設定されていません。Vercel の Project Settings → Environment Variables（ローカルなら
        .env.local）に次の値を入れて、再デプロイしてください。詳しくは README を見てください。
      </p>
      <ul className="card divide-y divide-border">
        {ENV_KEYS.map((e) => {
          const set = Boolean(process.env[e.key] ?? ("alt" in e ? process.env[e.alt] : undefined));
          return (
            <li key={e.key} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
              <div>
                <code className="text-xs">{e.key}</code>
                <div className="text-muted">{e.label}{e.required ? "（必須）" : ""}</div>
              </div>
              <span className={set ? "text-gain" : "text-muted"}>{set ? "✓ 設定済み" : "未設定"}</span>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
