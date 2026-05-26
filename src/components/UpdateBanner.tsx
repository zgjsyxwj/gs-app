import { useEffect, useRef, useState } from "react";
import { ipc, type UpdateInfo, type UpdateDownloadEvent } from "@/lib/ipc";
import { Button } from "@/components/ui/Button";
import { Progress } from "@/components/ui/Progress";

const AUTOCHECK_KEY = "pivot-desk.autoCheckUpdates";
const SKIP_KEY_PREFIX = "pivot-desk.skipVersion.";
const CHECK_DELAY_MS = 5_000;

// Fallback when the in-app updater can't reach GitHub's release CDN
// (release-assets.githubusercontent.com is frequently unreachable on CN
// networks even when api.github.com / objects.githubusercontent.com work).
// The .dmg is what mac users expect for a manual install; release page is
// a secondary link for users who want to see notes / pick a different asset.
const RELEASES_BASE = "https://github.com/zgjsyxwj/gs-app/releases";
const dmgUrl = (v: string) => `${RELEASES_BASE}/download/v${v}/Pivot.Desk_${v}_aarch64.dmg`;

// Settings.tsx dispatches this when the user clicks "立即检查".
export const CHECK_EVENT = "pivot-desk:check-update";

type Phase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "uptodate"
  | "error";

type DownloadProgress = {
  downloaded: number;
  total: number;
  speedBps: number;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatSpeed(bps: number): string {
  if (bps <= 0) return "–";
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${(bps / 1024 / 1024).toFixed(1)} MB/s`;
}

export default function UpdateBanner() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<DownloadProgress>({
    downloaded: 0,
    total: 0,
    speedBps: 0,
  });

  // Refs survive across re-renders without triggering them — used to throttle
  // setState during chunk callbacks (which fire hundreds of times/sec).
  const dlState = useRef<{
    start: number;
    downloaded: number;
    total: number;
    lastUiUpdate: number;
  }>({
    start: 0,
    downloaded: 0,
    total: 0,
    lastUiUpdate: 0,
  });

  // Auto-check on boot.
  useEffect(() => {
    const enabled = localStorage.getItem(AUTOCHECK_KEY);
    if (enabled === "false") return;
    const timer = setTimeout(() => {
      void runCheck(false);
    }, CHECK_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Manual check from Settings.
  useEffect(() => {
    const handler = () => {
      void runCheck(true);
    };
    window.addEventListener(CHECK_EVENT, handler);
    return () => window.removeEventListener(CHECK_EVENT, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "已是最新版本" toast auto-dismisses after 3s so it doesn't linger.
  useEffect(() => {
    if (phase !== "uptodate") return;
    const t = setTimeout(() => setPhase("idle"), 3_000);
    return () => clearTimeout(t);
  }, [phase]);

  async function runCheck(manual: boolean) {
    if (manual) {
      setPhase("checking");
      setError(null);
    }
    try {
      const u = await ipc.checkForUpdate();
      if (!u.available || !u.version) {
        if (manual) {
          setInfo(null);
          setPhase("uptodate");
        }
        return;
      }
      // Manual check ignores the skipped-versions list — the user explicitly
      // asked, so honor that even if they previously dismissed this version.
      if (!manual && localStorage.getItem(SKIP_KEY_PREFIX + u.version)) return;
      setInfo(u);
      setPhase("available");
    } catch (e) {
      if (manual) {
        setError(String(e));
        setPhase("error");
      }
      // Silent on auto-check; we never nag the user if they didn't ask.
    }
  }

  if (phase === "idle") return null;

  const onInstall = async () => {
    setError(null);
    dlState.current = { start: Date.now(), downloaded: 0, total: 0, lastUiUpdate: 0 };
    setProgress({ downloaded: 0, total: 0, speedBps: 0 });
    setPhase("downloading");
    try {
      await ipc.installAndRelaunch((ev: UpdateDownloadEvent) => {
        if (ev.event === "Started") {
          dlState.current.total = ev.data.contentLength ?? 0;
          setProgress((p) => ({ ...p, total: dlState.current.total }));
        } else if (ev.event === "Progress") {
          dlState.current.downloaded += ev.data.chunkLength;
          const now = Date.now();
          // Throttle UI updates to ~10fps — chunk callbacks fire much faster.
          if (now - dlState.current.lastUiUpdate >= 100) {
            dlState.current.lastUiUpdate = now;
            const elapsed = (now - dlState.current.start) / 1000;
            const speedBps = elapsed > 0 ? dlState.current.downloaded / elapsed : 0;
            setProgress({
              downloaded: dlState.current.downloaded,
              total: dlState.current.total,
              speedBps,
            });
          }
        } else if (ev.event === "Finished") {
          setProgress((p) => ({ ...p, downloaded: dlState.current.total || p.downloaded }));
          setPhase("installing");
        }
      });
    } catch (e) {
      setError(String(e));
      setPhase("error");
    }
  };

  const onSkip = () => {
    if (info?.version) localStorage.setItem(SKIP_KEY_PREFIX + info.version, "1");
    setPhase("idle");
  };

  const onDismiss = () => setPhase("idle");

  // "已是最新版本" toast — no version info, just acknowledge the check.
  if (phase === "uptodate") {
    return (
      <Toast>
        <div className="flex items-center gap-3">
          <Dot ok />
          <div className="flex-1 text-[13px]">已是最新版本</div>
          <Button variant="ghost" onClick={onDismiss}>
            关闭
          </Button>
        </div>
      </Toast>
    );
  }

  // "正在检查更新…" toast for manual check while in flight.
  if (phase === "checking") {
    return (
      <Toast>
        <div className="flex items-center gap-3">
          <Spinner />
          <div className="flex-1 text-[13px]">正在检查更新…</div>
        </div>
      </Toast>
    );
  }

  // Manual-check failure with no resolved version — generic error toast.
  if (phase === "error" && !info?.version) {
    return (
      <Toast>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-md bg-err/10 text-err">
            !
          </div>
          <div className="flex-1">
            <div className="text-[13px] font-semibold">检查更新失败</div>
            {error && <div className="mt-1 text-[11.5px] text-err">{error}</div>}
          </div>
          <Button variant="ghost" onClick={onDismiss}>
            关闭
          </Button>
        </div>
      </Toast>
    );
  }

  if (!info?.version) return null;

  const pct = progress.total > 0 ? Math.min(100, (progress.downloaded / progress.total) * 100) : 0;
  const showProgress = phase === "downloading" || phase === "installing";

  return (
    <Toast>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-md bg-accent-soft text-accent">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
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
          {info.notes && !showProgress && (
            <div className="mt-2 line-clamp-3 text-[12px] text-ink-70">{info.notes}</div>
          )}
          {showProgress && (
            <div className="mt-2">
              <Progress value={pct} />
              <div className="mt-1.5 flex items-center justify-between font-mono text-[11px] tabular-nums text-ink-50">
                <span>
                  {phase === "installing"
                    ? "正在安装…"
                    : `${formatBytes(progress.downloaded)} / ${progress.total > 0 ? formatBytes(progress.total) : "?"}`}
                </span>
                <span>{phase === "installing" ? "" : formatSpeed(progress.speedBps)}</span>
              </div>
            </div>
          )}
          {phase === "error" && error && (
            <>
              <div className="mt-2 text-[11.5px] text-err">更新失败:{error}</div>
              <div className="mt-1 text-[11px] text-ink-50">
                反复失败时可在浏览器中手动下载 .dmg 安装。
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        {phase === "available" && (
          <Button variant="ghost" onClick={onSkip}>
            跳过此版本
          </Button>
        )}
        {phase === "error" && (
          <>
            <Button variant="ghost" onClick={onDismiss}>
              稍后
            </Button>
            <Button variant="ghost" onClick={() => ipc.openUrl(dmgUrl(info.version!))}>
              在浏览器中下载
            </Button>
          </>
        )}
        {(phase === "available" || phase === "error") && (
          <Button onClick={onInstall}>{phase === "error" ? "重试" : "下载并重启"}</Button>
        )}
      </div>
    </Toast>
  );
}

function Toast({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed bottom-4 right-4 z-50 w-[340px] rounded-lg border border-rule bg-white p-4 shadow-pop"
      role="status"
      aria-live="polite"
    >
      {children}
    </div>
  );
}

function Dot({ ok }: { ok?: boolean }) {
  return (
    <span className={"inline-block h-2 w-2 rounded-full " + (ok ? "bg-accent" : "bg-ink-30")} />
  );
}

function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin text-ink-50" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
