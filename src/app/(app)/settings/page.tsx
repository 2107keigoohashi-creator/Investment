import Link from "next/link";
import { PageHeader, Section } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { asUser, loadAccounts, loadAssets, loadBaseCurrency } from "@/lib/data";
import { ENV_KEYS } from "@/lib/env";
import { AccountForm, AssetForm, FetchButtons } from "./forms";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const { accounts, assets, baseCurrency } = await asUser(async (tx) => ({
    accounts: await loadAccounts(tx),
    assets: await loadAssets(tx),
    baseCurrency: await loadBaseCurrency(tx),
  }));

  return (
    <>
      <PageHeader title="設定" back="/menu" />

      <Section title="口座">
        <ul className="space-y-2">
          {accounts.map((a) => (
            <li key={a.id}>
              <AccountForm account={a} />
            </li>
          ))}
          <li>
            <AccountForm />
          </li>
        </ul>
      </Section>

      <Section title="銘柄">
        <p className="mb-2 px-1 text-xs text-muted">
          銘柄の追加はマーケット画面の検索が簡単です。ここでは取得元や名前を細かく変えられます。
        </p>
        <details className="card p-4">
          <summary className="cursor-pointer list-none font-semibold">
            銘柄の一覧（{assets.length}）<span className="float-right text-muted">›</span>
          </summary>
          <ul className="mt-3 space-y-2">
            {assets.map((a) => (
              <li key={a.id}>
                <AssetForm asset={a} />
              </li>
            ))}
            <li>
              <AssetForm />
            </li>
          </ul>
        </details>
      </Section>

      <Section title="データ">
        <div className="card space-y-3 p-4">
          <Link href="/transactions" className="flex justify-between text-sm">
            <span>取引履歴（すべて）</span>
            <span className="text-muted">→</span>
          </Link>
          <FetchButtons />
        </div>
      </Section>

      <Section title="基準通貨">
        <div className="card p-4 text-sm">
          <div className="font-semibold">{baseCurrency}</div>
          <p className="mt-1 text-xs text-muted">
            損益・ACB はカナダの税制に合わせて CAD で計算します。USD 建ての取引は取引日の為替レートで CAD に換算します。
          </p>
        </div>
      </Section>

      <Section title="API キー（環境変数）">
        <ul className="card divide-y divide-border text-sm">
          {ENV_KEYS.map((e) => {
            const set = Boolean(process.env[e.key]);
            return (
              <li key={e.key} className="flex items-center justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0">
                  <div>{e.label}</div>
                  <code className="block truncate text-[11px] text-muted">{e.key}</code>
                </div>
                <span className={`shrink-0 text-xs ${set ? "text-gain" : e.required ? "text-loss" : "text-muted"}`}>
                  {set ? "✓ 設定済み" : "未設定"}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 px-1 text-xs text-muted">
          キーは安全のためアプリには保存せず、Vercel の Environment Variables で管理します。変更後は再デプロイが必要です。
        </p>
      </Section>

      <Section title="アカウント">
        <div className="card flex items-center justify-between p-4 text-sm">
          <span className="truncate text-muted">{user.email}</span>
          <form action="/auth/signout" method="post">
            <button className="btn text-sm" type="submit">ログアウト</button>
          </form>
        </div>
      </Section>
    </>
  );
}
