import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TASKS } from "@/tasks/registry";
import { Badge } from "@/components/ui/Badge";
import { ipc } from "@/lib/ipc";
import { cn } from "@/lib/utils";

const MONTH_STATS = { runs: 42, rows: 11824 };

// Per-task display fields the design needs but `registry.ts` doesn't carry yet
// (it mirrors the sidecar contract). Kept local until the sidecar exposes them.
const TASK_META: Record<string, { tag: string; runs: number }> = {
  "mp-cn": { tag: "报销", runs: 1248 },
  "ww-au": { tag: "报销", runs: 412 },
  "mp-in": { tag: "整理", runs: 87 },
  "va-pay": { tag: "Payroll", runs: 326 },
  "va-vn-r": { tag: "Payroll", runs: 154 },
  "va-vn-ps": { tag: "Payslip", runs: 154 },
};

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
  useEffect(() => {
    ipc
      .systemUsername()
      .then(setUsername)
      .catch(() => setUsername(""));
  }, []);
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* header */}
      <div className="border-b border-rule-soft px-9 pb-[18px] pt-[26px]">
        <div className="text-[11px] tracking-[0.04em] text-ink-50">{formatDateZh(new Date())}</div>
        <div className="mt-1.5 flex items-baseline justify-between">
          <h1 className="m-0 text-[22px] font-semibold tracking-[-0.01em]">
            {greetingZh(new Date().getHours())}
            {username && `，${username}`}
          </h1>
          <div className="text-[12px] text-ink-50">
            本月已处理 <span className="font-mono font-semibold text-ink">{MONTH_STATS.runs}</span>{" "}
            个任务
            <span className="mx-2 text-ink-30">·</span>
            输出{" "}
            <span className="font-mono font-semibold text-ink">
              {MONTH_STATS.rows.toLocaleString()}
            </span>{" "}
            行
          </div>
        </div>
      </div>

      {/* body */}
      <div className="overflow-auto px-9 pb-7 pt-5">
        <SectionLabel>选择处理任务</SectionLabel>

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
  const meta = TASK_META[task.id];
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
        <div className="mt-2.5 flex items-center gap-2.5 text-[10.5px] text-ink-50">
          {meta && <Badge>{meta.tag}</Badge>}
          <span className="font-mono">{task.inputs.map((s) => s.toUpperCase()).join(" · ")}</span>
          <span className="flex-1" />
          {meta && <span className="font-mono">{meta.runs.toLocaleString()} 次</span>}
        </div>
      </div>
    </Link>
  );
}
