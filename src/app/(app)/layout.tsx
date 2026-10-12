import { BottomNav } from "@/components/BottomNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="safe-bottom mx-auto max-w-xl px-4 pt-[calc(env(safe-area-inset-top)+12px)]">{children}</main>
      <BottomNav />
    </>
  );
}
