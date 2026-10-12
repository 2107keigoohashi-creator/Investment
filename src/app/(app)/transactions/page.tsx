import Link from "next/link";
import { TxList } from "@/components/TxList";
import { PageHeader } from "@/components/ui";
import { getDb, loadAccounts, loadAssets, loadTransactions, requireUser } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  await requireUser();
  const db = await getDb();
  const [accounts, assets, transactions] = await Promise.all([loadAccounts(db), loadAssets(db), loadTransactions(db)]);
  return (
    <>
      <PageHeader title="取引履歴" back="/settings" action={<Link href="/transactions/new" className="btn btn-primary text-sm">記録</Link>} />
      <TxList transactions={transactions} accounts={accounts} assets={assets} />
    </>
  );
}
