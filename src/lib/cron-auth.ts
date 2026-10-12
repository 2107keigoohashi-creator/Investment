import "server-only";
import { timingSafeEqual } from "node:crypto";

/** Vercel Cron は Authorization: Bearer <CRON_SECRET> を付けて呼ぶ */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}
