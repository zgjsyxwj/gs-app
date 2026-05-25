import { useEffect, useState } from "react";
import { ipc, type UpdateInfo } from "@/lib/ipc";
import { Button } from "@/components/ui/Button";

const AUTOCHECK_KEY = "pivot-desk.autoCheckUpdates";
const SKIP_KEY_PREFIX = "pivot-desk.skipVersion.";
const CHECK_DELAY_MS = 5_000;

type Phase = "idle" | "available" | "installing" | "error";

export default function UpdateBanner() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Toggle in Settings writes this; default true if never set.
    const enabled = localStorage.getItem(AUTOCHECK_KEY);
    if (enabled === "false") return;

    const timer = setTimeout(async () => {
      try {
        const u = await ipc.checkForUpdate();
        if (!u.available || !u.version) return;
        if (localStorage.getItem(SKIP_KEY_PREFIX + u.version)) return;
        setInfo(u);
        setPhase("available");
      } catch {
        // Silent failure on the auto-check — offline, no network, GitHub down.
        // We do NOT want to nag the user when they didn't ask.
      }
    }, CHECK_DELAY_MS);

    return () => clearTimeout(timer);
  }, []);

  if (phase === "idle" || !info?.version) return null;

  const onInstall = async () => {
    setPhase("installing");
    setError(null);
    try {
      await ipc.installAndRelaunch();
    } catch (e) {
      setError(String(e));
      setPhase("error");
    }
  };

  const onSkip = () => {
    if (info.version) localStorage.setItem(SKIP_KEY_PREFIX + info.version, "1");
    setPhase("idle");
  };

  return (
    <div
      className="fixed bottom-4 right-4 z-50 w-[340px] rounded-lg border border-rule bg-white p-4 shadow-pop"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-md bg-accent-soft text-accent">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12" />
            <path d="m7 10 5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold">新版本 {info.version} 已发布</div>
          <div className="mt-0.5 font-mono text-[11px] text-ink-50">
            当前 {info.currentVersion ?? "–"} → {info.version}
          </div>
          {info.notes && (
            <div className="mt-2 line-clamp-3 text-[12px] text-ink-70">{info.notes}</div>
          )}
          {phase === "error" && error && (
            <div className="mt-2 text-[11.5px] text-err">更新失败:{error}</div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onSkip} disabled={phase === "installing"}>
          稍后
        </Button>
        <Button onClick={onInstall} disabled={phase === "installing"}>
          {phase === "installing" ? "下载安装中…" : "下载并重启"}
        </Button>
      </div>
    </div>
  );
}
