import { Link } from "react-router-dom";
import { TASKS } from "@/tasks/registry";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

// Mock telemetry — replace with sidecar data once `ipc.recentRuns()` lands.
const RECENT = [
  { id: "r-1041", task: "MP-CN",    file: "2025-04 微创差旅汇总.xlsx",       rows: 3128, ms: 4120,  when: "今天 14:22", status: "ok"   as const },
  { id: "r-1040", task: "VA-PAY",   file: "Varian_Apr25_PayrollMaster.xlsx", rows: 1882, ms: 6741,  when: "今天 11:08", status: "ok"   as const },
  { id: "r-1039", task: "WW-AU",    file: "WW_AUS_Expense_Q1.xlsx",          rows: 642,  ms: 1834,  when: "昨天 17:54", status: "warn" as const },
  { id: "r-1038", task: "VA-VN-PS", file: "VN_payslip_apr.xlsx",             rows: 154,  ms: 22810, when: "昨天 16:30", status: "ok"   as const }
];

const MONTH_STATS = { runs: 42, rows: 11824 };

// Per-task display fields the design needs but `registry.ts` doesn't carry yet
// (it mirrors the sidecar contract). Kept local until the sidecar exposes them.
const TASK_META: Record<string, { tag: string; runs: number }> = {
  "mp-cn":    { tag: "报销",    runs: 1248 },
  "ww-au":    { tag: "报销",    runs: 412  },
  "mp-in":    { tag: "整理",    runs: 87   },
  "va-pay":   { tag: "Payroll", runs: 326  },
  "va-vn-r":  { tag: "Payroll", runs: 154  },
  "va-vn-ps": { tag: "Payslip", runs: 154  }
};

const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];
function formatDateZh(d: Date) {
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · 星期${WEEKDAY[d.getDay()]}`;
}

export default function Dashboard() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* header */}
      <div className="border-b border-rule-soft px-9 pb-[18px] pt-[26px]">
        <div className="text-[11px] tracking-[0.04em] text-ink-50">
          {formatDateZh(new Date())}
        </div>
        <div className="mt-1.5 flex items-baseline justify-between">
          <h1 className="m-0 text-[22px] font-semibold tracking-[-0.01em]">下午好，Yuxin</h1>
          <div className="text-[12px] text-ink-50">
            本月已处理 <span className="font-mono font-semibold text-ink">{MONTH_STATS.runs}</span> 个任务
            <span className="mx-2 text-ink-30">·</span>
            输出 <span className="font-mono font-semibold text-ink">{MONTH_STATS.rows.toLocaleString()}</span> 行
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

        <div className="mt-6">
          <SectionLabel>最近运行</SectionLabel>
        </div>

        <Card className="overflow-hidden">
          <CardHeader>
            <div className="grid grid-cols-[80px_1fr_90px_90px_110px_70px]">
              <div>任务</div>
              <div>文件</div>
              <div className="text-right">行数</div>
              <div className="text-right">用时</div>
              <div className="text-right">时间</div>
              <div className="text-right">状态</div>
            </div>
          </CardHeader>
          {RECENT.map(r => <RunRow key={r.id} run={r} />)}
        </Card>
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
          <span className="font-mono">{task.inputs.map(s => s.toUpperCase()).join(" · ")}</span>
          <span className="flex-1" />
          {meta && <span className="font-mono">{meta.runs.toLocaleString()} 次</span>}
        </div>
      </div>
    </Link>
  );
}

type Run = (typeof RECENT)[number];

function RunRow({ run }: { run: Run }) {
  const tone =
    run.status === "ok"   ? { dot: "bg-accent", text: "text-accent", label: "成功"   } :
    run.status === "warn" ? { dot: "bg-warn",   text: "text-warn",   label: "有警告" } :
                            { dot: "bg-err",    text: "text-err",    label: "失败"   };
  return (
    <div className="grid grid-cols-[80px_1fr_90px_90px_110px_70px] items-center border-b border-rule-soft px-4 py-2.5 text-[12px] text-ink-70 last:border-b-0">
      <div className="font-mono text-[11px] text-ink">{run.task}</div>
      <div className="truncate">{run.file}</div>
      <div className="text-right font-mono">{run.rows.toLocaleString()}</div>
      <div className="text-right font-mono">{(run.ms / 1000).toFixed(2)}s</div>
      <div className="text-right font-mono text-ink-50">{run.when}</div>
      <div className="flex items-center justify-end gap-1.5">
        <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
        <span className={cn("text-[11px]", tone.text)}>{tone.label}</span>
      </div>
    </div>
  );
}
