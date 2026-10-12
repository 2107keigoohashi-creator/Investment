import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { todayIn } from "@/lib/calc/dates";
import { asUser, loadAssets, TZ } from "@/lib/data";
import { Simulator } from "./Simulator";

export const metadata: Metadata = { title: "シミュレーター" };
export const dynamic = "force-dynamic";

export default async function SimulatorPage() {
  const assets = await asUser(loadAssets);
  const options = assets
    .filter((a) => a.is_active && a.asset_type !== "cash")
    .map((a) => ({ id: a.id, symbol: a.symbol, name: a.name }));
  return (
    <>
      <PageHeader title="シミュレーター" back="/menu" />
      <Simulator assets={options} today={todayIn(TZ)} />
    </>
  );
}
