import { Card, CardHeader } from "@/components/ui/Card";

const HIST = [
  { id: "r-1042", task: "VA-PAY", file: "Varian_Apr25_PayrollMaster.xlsx", rows: 1882, ms: 4180, when: "今天 14:22", status: "ok" as const },
  { id: "r-1041", task: "MP-CN",  file: "2025-04 微创差旅汇总.xlsx", rows: 3128, ms: 4120, when: "今天 14:18", status: "ok" as const },
  { id: "r-1040", task: "VA-PAY", file: "Varian_Apr25_PayrollMaster.xlsx", rows: 1882, ms: 6741, when: "今天 11:08", status: "ok" as const },
  { id: "r-1039", task: "WW-AU",  file: "WW_AUS_Expense_Q1.xlsx", rows: 642, ms: 1834, when: "昨天 17:54", status: "warn" as const },
  { id: "r-1037", task: "MP-IN",  file: "MP_India_Apr_Receipts.zip", rows: 87, ms: 11960, when: "5/18 09:11", status: "ok" as const },
  { id: "r-1036", task: "VA-VN-R", file: "VN_Payroll_Apr25_v2.xlsx", rows: 154, ms: 3402, when: "5/17 14:47", status: "err" as const }
];

export default function History() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-rule-soft px-9 pb-4 pt-6">
        <h1 className="m-0 text-[22px] font-semibold">历史记录</h1>
        <div className="mt-1 text-[12.5px] text-ink-50">所有运行均保留 90 天。</div>
      </div>
      <div className="overflow-auto px-9 pb-7 pt-4">
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="grid grid-cols-[80px_90px_1fr_80px_90px_110px_80px]">
              <div>RUN</div><div>任务</div><div>文件</div>
              <div className="text-right">行数</div>
              <div className="text-right">用时</div>
              <div className="text-right">时间</div>
              <div className="text-right">状态</div>
            </div>
          </CardHeader>
          {HIST.map(r => {
            const c = r.status === "ok" ? "text-accent" : r.status === "warn" ? "text-warn" : "text-err";
            const d = r.status === "ok" ? "bg-accent"    : r.status === "warn" ? "bg-warn"    : "bg-err";
            const l = r.status === "ok" ? "成功" : r.status === "warn" ? "有警告" : "失败";
            return (
              <div key={r.id} className="grid grid-cols-[80px_90px_1fr_80px_90px_110px_80px] items-center border-b border-rule-soft px-4 py-2.5 text-[12px] last:border-b-0">
                <div className="font-mono text-[11px] text-ink-70">{r.id}</div>
                <div className="font-mono text-[11px] text-ink">{r.task}</div>
                <div className="truncate">{r.file}</div>
                <div className="text-right font-mono">{r.rows.toLocaleString()}</div>
                <div className="text-right font-mono">{(r.ms / 1000).toFixed(2)}s</div>
                <div className="text-right font-mono text-ink-50">{r.when}</div>
                <div className="flex items-center justify-end gap-1.5 text-right">
                  <span className={"h-1.5 w-1.5 rounded-full " + d} />
                  <span className={"text-[11px] " + c}>{l}</span>
                </div>
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
}
