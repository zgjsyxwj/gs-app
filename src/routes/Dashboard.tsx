import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TASKS } from "@/tasks/registry";
import { FxPanel } from "@/components/dashboard/FxPanel";
import { ipc } from "@/lib/ipc";
import { cn } from "@/lib/utils";

const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];
function formatDateZh(d: Date) {
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · 星期${WEEKDAY[d.getDay()]}`;
}

function greetingZh(h: number) {
  if (h >= 5 && h < 11) return "早上好";
  if (h >= 11 && h < 13) return "中午好";
  if (h >= 13 && h < 18) return "下午好";
  return "该休息了";
}

export default function Dashboard() {
  const [username, setUsername] = useState("");
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    ipc
      .systemUsername()
      .then(setUsername)
      .catch(() => setUsername(""));
  }, []);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* header */}
      <div className="border-b border-rule-soft px-9 pb-[18px] pt-[26px]">
        <div className="text-[11px] tracking-[0.04em] text-ink-50">{formatDateZh(now)}</div>
        <h1 className="m-0 mt-1.5 text-[22px] font-semibold tracking-[-0.01em]">
          {greetingZh(now.getHours())}
          {username && `,${username}`}
        </h1>
      </div>

      {/* body */}
      <div className="overflow-auto px-9 pb-7 pt-5">
        <FxPanel />

        <SectionLabel>处理任务</SectionLabel>

        <div className="grid grid-cols-2 gap-2.5">
          {TASKS.map((m, i) => (
            <TaskCard key={m.id} task={m} highlight={i === 0} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-50">
      {children}
    </div>
  );
}

function TaskCard({ task, highlight }: { task: (typeof TASKS)[number]; highlight: boolean }) {
  return (
    <Link
      to={`/task/${task.id}`}
      className="flex items-start gap-3.5 rounded-md border border-rule bg-card px-4 py-3.5 shadow-card transition-colors hover:border-ink-10"
    >
      <div
        className={cn(
          "flex h-8 w-8 flex-none items-center justify-center rounded-md border border-rule font-mono text-[11px] font-semibold",
          highlight ? "bg-accent-soft text-accent" : "bg-panel text-ink-70"
        )}
      >
        {task.code.split("-")[0]}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-ink">{task.name}</div>
        <div className="mt-[3px] text-[11.5px] leading-[1.45] text-ink-50">{task.desc}</div>
      </div>
    </Link>
  );
}
