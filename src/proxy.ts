import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "./lib/session";

/**
 * すべてのページの前でログインを確認し、未ログインならログイン画面へ送る。
 * /api/cron は CRON_SECRET で守るので対象外。
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!process.env.DATABASE_URL || (process.env.SESSION_SECRET?.length ?? 0) < 32) {
    // 環境変数がまだない場合はセットアップ案内を出す
    if (pathname.startsWith("/setup")) return NextResponse.next();
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  const isPublic = pathname.startsWith("/login");
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  if (!session && !isPublic) {
    const to = new URL("/login", request.url);
    if (pathname !== "/") to.searchParams.set("next", pathname);
    return NextResponse.redirect(to);
  }
  if (session && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api/cron|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|apple-touch-icon.png|.*\\.(?:png|svg|jpg|jpeg|webp|ico)$).*)",
  ],
};
