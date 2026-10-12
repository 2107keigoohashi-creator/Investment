import Link from "next/link";
import { TxList } from "@/components/TxList";
import { PageHeader } from "@/components/ui";
import { asUser, loadAccounts, loadAssets, loadTransactions } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const { accounts, assets, transactions } = await asUser(async (tx) => ({
    accounts: await loadAccounts(tx),
    assets: await loadAssets(tx),
    transactions: await loadTransactions(tx),
  }));
  return (
    <>
      <PageHeader title="取引履歴" back="/settings" action={<Link href="/transactions/new" className="btn btn-primary text-sm">記録</Link>} />
      <TxList transactions={transactions} accounts={accounts} assets={assets} />
    </>
  );
}
