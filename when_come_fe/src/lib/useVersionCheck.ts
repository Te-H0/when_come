import { useEffect } from "react";
import { toast } from "sonner";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5분

let hasShownNewVersionToast = false;

async function fetchRemoteBuildId(): Promise<string | null> {
  try {
    const res = await fetch(`/version.txt?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    return text || null;
  } catch {
    return null;
  }
}

function showNewVersionToast(): void {
  if (hasShownNewVersionToast) return;
  hasShownNewVersionToast = true;
  toast("새 버전이 있어요", {
    description: "새로고침하면 최신 변경이 반영돼요",
    action: {
      label: "새로고침",
      onClick: () => location.reload(),
    },
    duration: Infinity,
  });
}

export function useVersionCheck(): void {
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    if (__BUILD_ID__.startsWith("dev-")) return;

    let cancelled = false;

    async function check(): Promise<void> {
      const remote = await fetchRemoteBuildId();
      if (cancelled || !remote) return;
      if (remote !== __BUILD_ID__) showNewVersionToast();
    }

    void check();
    const intervalId = window.setInterval(check, POLL_INTERVAL_MS);

    function onVisibilityChange(): void {
      if (document.visibilityState === "hidden") return;
      // visible 복귀 시 즉시 1회 check — 30분 이상 백그라운드여도 자동 reload 없이 토스트만
      void check();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);
}
