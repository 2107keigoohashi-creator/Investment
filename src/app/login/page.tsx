import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "ログイン" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-2xl font-bold text-accent-ink">◯</div>
        <h1 className="text-2xl font-bold">Maru Invest</h1>
        <p className="mt-1 text-sm text-muted">自分専用の投資管理</p>
      </div>
      <LoginForm next={next} />
    </main>
  );
}
