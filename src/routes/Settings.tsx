import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ipc, type SidecarStatus } from "@/lib/ipc";
import { CHECK_EVENT } from "@/components/UpdateBanner";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-rule-soft px-4 py-3 text-[13px] last:border-b-0">
      <span className="text-ink-70">{label}</span>
      <span>{children}</span>
    </div>
  );
}

function Toggle({ on, onClick }: { on?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!on}
      onClick={onClick}
      className={"relative inline-block h-[18px] w-8 rounded-full transition-colors " +
        (on ? "bg-accent" : "bg-[#E6E2D6]")}>
      <span className={"absolute top-[2px] h-3.5 w-3.5 rounded-full bg-white shadow transition-[left] " +
        (on ? "left-[16px]" : "left-[2px]")} />
    </button>
  );
}

const AUTOCHECK_KEY = "pivot-desk.autoCheckUpdates";

export default function Settings() {
  const [s, setS] = useState<SidecarStatus | null>(null);
  const [autoCheck, setAutoCheck] = useState(() => localStorage.getItem(AUTOCHECK_KEY) !== "false");
  useEffect(() => { ipc.sidecarStatus().then(setS).catch(() => setS(null)); }, []);
  useEffect(() => { localStorage.setItem(AUTOCHECK_KEY, String(autoCheck)); }, [autoCheck]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-rule-soft px-9 pb-4 pt-6">
        <h1 className="m-0 text-[22px] font-semibold">设置</h1>
        <div className="mt-1 text-[12.5px] text-ink-50">常规偏好、Python 处理引擎与默认目录。</div>
      </div>

      <div className="grid grid-cols-[172px_1fr] gap-9 overflow-auto px-9 pb-7 pt-5">
        <nav className="flex flex-col gap-px text-[13px]">
          <div className="rounded-md bg-accent/10 px-2.5 py-1.5 font-semibold text-accent">常规</div>
          <div className="px-2.5 py-1.5 text-ink-70">处理引擎</div>
          <div className="px-2.5 py-1.5 text-ink-70">文件与路径</div>
          <div className="px-2.5 py-1.5 text-ink-70">外观与字体</div>
          <div className="px-2.5 py-1.5 text-ink-70">键盘快捷键</div>
          <div className="px-2.5 py-1.5 text-ink-70">关于</div>
        </nav>

        <div className="flex min-w-0 flex-col gap-6">
          <section>
            <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-50">常规</div>
            <Card className="overflow-hidden">
              <Row label="语言"><span className="rounded-sm border border-rule bg-white px-2 py-0.5 text-[12px]">简体中文</span></Row>
              <Row label="启动时打开"><span className="rounded-sm border border-rule bg-white px-2 py-0.5 text-[12px]">主页</span></Row>
              <Row label="完成后通知"><Toggle on /></Row>
              <Row label="自动检查更新">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    onClick={() => window.dispatchEvent(new Event(CHECK_EVENT))}
                  >
                    立即检查
                  </Button>
                  <Toggle on={autoCheck} onClick={() => setAutoCheck(v => !v)} />
                </div>
              </Row>
            </Card>
          </section>

          <section>
            <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-50">Python 处理引擎</div>
            <Card className="overflow-hidden">
              <div className="flex items-center gap-3 border-b border-rule bg-accent-soft px-4 py-3">
                <span className="relative inline-flex h-2 w-2 items-center justify-center">
                  <span className={"absolute inset-0 rounded-full " + (s?.connected ? "bg-accent" : "bg-ink-30")} />
                </span>
                <div className="flex-1">
                  <div className="text-[13px] font-semibold">处理引擎 {s?.connected ? "已连接" : "未连接"}</div>
                  <div className="mt-0.5 font-mono text-[11.5px] text-ink-50">
                    pivot-sidecar · {s?.version ?? "–"} · Python {s?.python_version ?? "–"} · pid {s?.pid ?? "–"}
                  </div>
                </div>
                <Button variant="secondary" onClick={() => ipc.restartSidecar()}>重启</Button>
                <Button variant="ghost">查看日志</Button>
              </div>
              <Row label="启动方式"><span className="rounded-sm border border-rule bg-white px-2 py-0.5 text-[12px]">随应用启动</span></Row>
              <Row label="允许网络访问"><Toggle /></Row>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
