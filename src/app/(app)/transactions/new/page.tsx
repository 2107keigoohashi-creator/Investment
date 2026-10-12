import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { todayIn } from "@/lib/calc/dates";
import { getDb, latestFx, loadAccounts, loadAssets, requireUser, TZ } from "@/lib/data";
import { TransactionForm } from "./TransactionForm";

export const metadata: Metadata = { title: "取引の記録" };
export const dynamic = "force-dynamic";

export default async function NewTransactionPage({ searchParams }: PageProps<"/transactions/new">) {
  await requireUser();
  const sp = await searchParams;
  const db = await getDb();
  const [accounts, assets, usd, lastTx] = await Promise.all([
    loadAccounts(db),
    loadAssets(db),
    latestFx(db, "USD"),
    db.from("transactions").select("account_id, asset_id").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const activeAccounts = accounts.filter((a) => a.is_active);
  const activeAssets = assets.filter((a) => a.is_active);
  const wanted = typeof sp.asset === "string" ? sp.asset.toUpperCase() : null;
  // 既定値: URL の銘柄 → 前回の取引 → 最初の銘柄
  const defaultAsset =
    activeAssets.find((a) => a.symbol === wanted) ??
    activeAssets.find((a) => a.id === lastTx.data?.asset_id) ??
    activeAssets.find((a) => a.asset_type !== "cash") ??
    activeAssets[0];
  const defaultAccount = activeAccounts.find((a) => a.id === lastTx.data?.account_id) ?? activeAccounts[0];

  return (
    <>
      <PageHeader title="取引の記録" back="/" />
      {activeAccounts.length === 0 ? (
        <p className="text-sm text-muted">先に「設定」で口座を追加してください。</p>
      ) : (
        <TransactionForm
          accounts={activeAccounts}
          assets={activeAssets}
          defaultAccountId={defaultAccount?.id ?? ""}
          defaultAssetId={defaultAsset?.id ?? ""}
          today={todayIn(TZ)}
          usdCad={usd}
        />
      )}
    </>
  );
}
