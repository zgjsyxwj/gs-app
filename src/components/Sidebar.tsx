import { NavLink } from "react-router-dom";
import { TASKS } from "@/tasks/registry";
import { TASK_SHORT } from "@/tasks/labels";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { ipc, type SidecarStatus } from "@/lib/ipc";

function NavRow({ to, label, end }: { to: string; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex h-7 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium",
          isActive ? "bg-accent/10 text-accent" : "text-ink-70 hover:bg-black/[0.04]"
        )
      }
    >
      {label}
    </NavLink>
  );
}

function TaskRow({ id, code, short }: { id: string; code: string; short: string }) {
  const tag = code.split("-")[0].slice(0, 2);
  return (
    <NavLink
      to={`/task/${id}`}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12.5px]",
          isActive
            ? "border border-rule bg-white font-semibold text-ink shadow-card"
            : "border border-transparent text-ink-70 hover:bg-black/[0.03]"
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              "flex h-5 w-5 flex-none items-center justify-center rounded-sm border border-rule font-mono text-[9.5px] font-semibold",
              isActive ? "bg-accent-soft text-accent" : "bg-white text-ink-50"
            )}
          >
            {tag}
          </span>
          <span className="min-w-0 leading-tight">{short}</span>
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar() {
  const [status, setStatus] = useState<SidecarStatus | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    ipc
      .sidecarStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
    ipc
      .appVersion()
      .then(setVersion)
      .catch(() => setVersion(null));
  }, []);

  return (
    <aside className="flex w-[232px] flex-col border-r border-rule bg-panel px-2.5 py-4 text-[13px]">
      <div className="flex items-center gap-2.5 px-2.5 pb-4">
        <div className="h-5.5 w-5.5 flex h-[22px] w-[22px] items-center justify-center rounded-md bg-accent font-mono text-[12px] font-semibold text-white">
          P
        </div>
        <div className="leading-tight">
          <div className="text-[13px] font-semibold">Pivot Desk</div>
          <div className="mt-0.5 text-[10.5px] text-ink-50">数据处理工作台</div>
        </div>
      </div>

      <NavRow to="/" label="主页" end />
      <NavRow to="/settings" label="设置" />

      <div className="px-3 pb-1.5 pt-[18px] text-[10.5px] font-semibold uppercase tracking-wider text-ink-50">
        处理任务
      </div>
      <div className="flex flex-col gap-px overflow-hidden">
        {TASKS.map((t) => (
          <TaskRow key={t.id} id={t.id} code={t.code} short={TASK_SHORT[t.id] ?? t.name} />
        ))}
      </div>

      <div className="flex-1" />

      <div className="px-3 pt-2 text-[11px] text-ink-50">
        <div className="font-mono">v{version ?? "–"}</div>
        <div className="mt-1 flex items-center gap-2">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              status?.connected ? "bg-[#67B26F]" : "bg-ink-30"
            )}
          />
          <span className="font-mono">sidecar · {status?.version ?? "–"}</span>
        </div>
      </div>
    </aside>
  );
}
