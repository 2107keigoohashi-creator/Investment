import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ownerSql } from "./db";
import { SESSION_COOKIE, SESSION_DAYS, signSession, verifySession, type Session } from "./session";

/** メールとパスワードを確認（bcrypt は DB の pgcrypto で照合） */
export async function checkPassword(email: string, password: string): Promise<Session | null> {
  const rows = await ownerSql()<{ id: string; email: string }[]>`
    select id, email from app_users
    where email = ${email.toLowerCase()} and password_hash = crypt(${password}, password_hash)`;
  return rows[0] ? { userId: rows[0].id, email: rows[0].email } : null;
}

export async function startSession(s: Session) {
  const store = await cookies();
  store.set(SESSION_COOKIE, await signSession(s), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export const getSession = cache(async (): Promise<Session | null> => {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value);
});

/** ログイン中のユーザー。いなければログイン画面へ */
export async function requireUser(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}
