import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "ログイン" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-3xl font-black text-accent-ink shadow-[0_0_40px_rgba(34,211,238,0.45)]">
          M
        </div>
        <h1 className="text-2xl font-bold tracking-[0.2em]">MARU INVEST</h1>
        <p className="label mt-2">Personal portfolio terminal</p>
      </div>
      <div className="card card-glow p-5">
        <LoginForm next={next} />
      </div>
    </main>
  );
}
