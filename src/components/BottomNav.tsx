"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "ホーム", icon: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z", match: ["/"] },
  { href: "/market", label: "マーケット", icon: "M3 17l5-5 4 4 8-8M15 8h5v5", match: ["/market", "/assets"] },
  { href: "/transactions/new", label: "記録", icon: "M12 5v14M5 12h14", primary: true, match: ["/transactions/new"] },
  { href: "/news", label: "ニュース", icon: "M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5", match: ["/news"] },
  {
    href: "/menu",
    label: "メニュー",
    icon: "M4 7h16M4 12h16M4 17h16",
    match: ["/menu", "/reports", "/dca", "/simulator", "/settings", "/transactions"],
  },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-[rgba(5,7,13,0.82)] backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {items.map((it) => {
          const active =
            it.href === "/"
              ? pathname === "/"
              : it.match.some((m) => pathname === m || pathname.startsWith(`${m}/`)) &&
                !(it.href === "/menu" && pathname.startsWith("/transactions/new"));
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] ${active ? "text-accent" : "text-muted"}`}
              >
                <span
                  className={
                    it.primary
                      ? "flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-accent-ink shadow-[0_0_20px_rgba(34,211,238,0.5)]"
                      : `flex h-6 w-6 items-center justify-center ${active ? "drop-shadow-[0_0_6px_rgba(34,211,238,0.8)]" : ""}`
                  }
                >
                  <svg viewBox="0 0 24 24" width={it.primary ? 20 : 22} height={it.primary ? 20 : 22} fill="none" stroke="currentColor" strokeWidth={it.primary ? 2.4 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d={it.icon} />
                  </svg>
                </span>
                {it.label}
                {active && !it.primary && (
                  <span className="absolute top-0 h-0.5 w-8 rounded-full bg-accent shadow-[0_0_10px_rgba(34,211,238,0.9)]" aria-hidden />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
