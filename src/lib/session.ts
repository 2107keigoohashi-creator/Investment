// ログインセッション（署名付き JWT を httpOnly Cookie に入れる）。proxy.ts からも使うので server-only にしない
import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "maru_session";
export const SESSION_DAYS = 30;

export interface Session {
  userId: string;
  email: string;
}

function secret(): Uint8Array | null {
  const v = process.env.SESSION_SECRET;
  return v && v.length >= 32 ? new TextEncoder().encode(v) : null;
}

export async function signSession(s: Session): Promise<string> {
  const key = secret();
  if (!key) throw new Error("SESSION_SECRET（32 文字以上）が設定されていません");
  return new SignJWT({ email: s.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(key);
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  const key = secret();
  if (!token || !key) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    return { userId: payload.sub, email: String(payload.email ?? "") };
  } catch {
    return null;
  }
}
