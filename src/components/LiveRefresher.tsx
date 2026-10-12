"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * 画面を開いている間、一定間隔でリアルタイム価格を取り（/api/live がDBに保存）、画面を再描画する。
 * タブが裏にあるときは止める。
 */
export function LiveRefresher({ ids, intervalMs = 60_000 }: { ids?: string[]; intervalMs?: number }) {
  const router = useRouter();
  const [at, setAt] = useState<Date | null>(null);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  const key = ids?.join(",") ?? "";

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === "visible" && !busy.current) {
        busy.current = true;
        try {
          const res = await fetch(`/api/live${key ? `?ids=${key}` : ""}`, { cache: "no-store" });
          if (!res.ok) throw new Error(String(res.status));
          const data: { quotes: unknown[]; missing: string[] } = await res.json();
          // 1 件も取れなかったら失敗扱い（画面は前回の値のまま）
          if (data.quotes.length === 0 && data.missing.length > 0) throw new Error("no quotes");
          setAt(new Date());
          setFailed(false);
          router.refresh();
        } catch {
          setFailed(true);
        } finally {
          busy.current = false;
        }
      }
      timer = setTimeout(tick, intervalMs);
    };
    timer = setTimeout(tick, 800);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        timer = setTimeout(tick, 300);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key, intervalMs, router]);

  return <LiveBadge at={at} failed={failed} />;
}

export function LiveBadge({ at, failed }: { at: Date | null; failed: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted" aria-live="polite">
      <span
        className={`h-1.5 w-1.5 rounded-full ${failed ? "bg-warn" : at ? "bg-gain" : "bg-muted"}`}
        aria-hidden
      />
      {failed
        ? "リアルタイム取得に失敗（前回の値）"
        : at
          ? `リアルタイム ${at.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
          : "リアルタイム取得中…"}
    </span>
  );
}
