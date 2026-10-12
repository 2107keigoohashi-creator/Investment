import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "メニュー" };

const ITEMS = [
  { href: "/simulator", label: "シミュレーター", desc: "過去で試す・将来を試算" },
  { href: "/reports", label: "レポート", desc: "毎朝のレポートの一覧" },
  { href: "/dca", label: "積立（DCA）", desc: "積立ルールと次に買う日" },
  { href: "/transactions", label: "取引履歴", desc: "記録したすべての取引" },
  { href: "/settings", label: "設定", desc: "口座・銘柄・データ取得・ログアウト" },
];

export default function MenuPage() {
  return (
    <>
      <PageHeader title="メニュー" />
      <ul className="card divide-y divide-border">
        {ITEMS.map((it) => (
          <li key={it.href}>
            <Link href={it.href} className="flex items-center gap-3 px-4 py-4">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{it.label}</div>
                <div className="text-xs text-muted">{it.desc}</div>
              </div>
              <span className="text-muted" aria-hidden>
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
