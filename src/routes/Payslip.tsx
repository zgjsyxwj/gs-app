import { useState } from "react";
import { taskById } from "@/tasks/registry";
import { cn } from "@/lib/utils";

// Spec mock — replace with sidecar discovery once `ipc.payslipScan(dir)` lands.
const ROWS = [
  { code: "Z004BSBU", slug: "nguyen-hoang-tien",     name: "NGUYỄN HOÀNG TIẾN" },
  { code: "Z004BSBX", slug: "nguyen-do-kien",        name: "NGUYỄN ĐỖ KIÊN" },
  { code: "Z004BSBY", slug: "dong-tan-phuoc",        name: "ĐỒNG TẤN PHƯỚC" },
  { code: "Z004HJ1X", slug: "nguyen-thuy-hung",      name: "NGUYỄN THÚY HƯỚNG" },
  { code: "Z004HNTP", slug: "mai-van-hai",           name: "MAI VĂN HẢI" },
  { code: "Z004JW5P", slug: "van-duc-khai",          name: "VĂN ĐỨC KHẢI" },
  { code: "Z004KF2F", slug: "nguyen-thi-dieu-hien",  name: "NGUYỄN THỊ DIỆU HIỀN" },
  { code: "Z004PWCK", slug: "dang-xuan-tung",        name: "ĐẶNG XUÂN TÙNG" },
  { code: "Z004RCET", slug: "nguyen-van-duong",      name: "NGUYỄN VĂN DUONG" },
  { code: "Z004U1WY", slug: "vo-hong-duong",         name: "VÕ HỒNG DƯỜNG" },
  { code: "Z0055DAZ", slug: "pham-khanh-huyen",      name: "PHẠM KHÁNH HUYỀN" },
  { code: "Z0058MRF", slug: "nguyen-duc-nghia",      name: "NGUYỄN ĐỨC NGHĨA" }
];

const PERIOD = "Apr-2026";
const PERIOD_NUM = "202604";
const origName = (r: (typeof ROWS)[number]) => `${r.code}-${r.slug}_payslip_for_${PERIOD}.pdf`;
const newName  = (r: (typeof ROWS)[number]) => `${r.code}_${PERIOD_NUM}.pdf`;

type Mode = "ready" | "running" | "done";

export default function Payslip() {
  const task = taskById("va-vn-ps")!;
  const [mode, setMode] = useState<Mode>("ready");
  // running cursor — sidecar progress events will drive this; for now mock at 5/6.
  const runningCursor = 5;

  function handleRun() {
    // TODO: replace with ipc.startRun({ taskId: "va-vn-ps", ... }) wiring.
    setMode("done");
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <Header subtitle="复制每个供应商 PDF → 按 {code}_{YYYYMM}.pdf 重命名 → 清除底部水印。原始文件不会被修改。" code={task.code} />

      {/* path bar */}
      <div className="flex items-stretch gap-2.5 px-8 pt-3.5">
        <PathField
          label="来源 · 供应商 payslip"
          path="~/Inbox/Varian/VN/Apr-2026/"
          count="12 PDF · 0.6 MB"
        />
        <PathArrow />
        <PathField
          label="输出 · CDP 交付"
          path="~/Desktop/Payslip_CDP_202604/"
          count={mode === "done" ? "12 PDF · 0.6 MB" : "空"}
        />
      </div>

      {/* action strip */}
      <div className="mx-8 mt-3.5 flex items-center gap-[18px] rounded-lg border border-rule bg-card px-[18px] py-3.5">
        <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-accent-soft text-accent">
          <FileIcon />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold text-ink">一键执行：复制 + 重命名 + 去水印</div>
        </div>
        <PrimaryRunButton count={ROWS.length} disabled={mode !== "ready"} onClick={handleRun} />
      </div>

      {/* comparison list */}
      <div className="flex min-h-0 flex-1 px-8 pb-[22px] pt-3.5">
        <ComparisonList mode={mode} runningCursor={runningCursor} />
      </div>
    </div>
  );
}

// ─────────────────────────── header ───────────────────────────

function Header({ subtitle, code }: { subtitle: string; code: string }) {
  return (
    <div className="border-b border-rule-soft px-8 pb-4 pt-5">
      <div className="flex items-center gap-2 text-[11px] text-ink-50">
        <span>处理任务</span>
        <span className="text-ink-30">/</span>
        <span className="font-mono">{code}</span>
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-6">
        <div className="min-w-0">
          <h1 className="m-0 mb-1 text-[20px] font-semibold tracking-[-0.01em]">
            瓦里安越南 · Payslip 去水印与重命名
          </h1>
          <div className="max-w-[740px] text-[12.5px] leading-[1.55] text-ink-50">{subtitle}</div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── path field + arrow ───────────────────────────

function PathField({ label, path, count }: { label: string; path: string; count: string }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 rounded-md border border-rule bg-card px-3.5 py-2.5">
      <div className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-md bg-panel text-ink-70">
        <FolderIcon />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-ink-50">{label}</div>
        <div className="mt-0.5 truncate font-mono text-[12px] text-ink">{path}</div>
      </div>
      <div className="flex-none rounded-sm bg-panel px-2 py-[3px] font-mono text-[11px] text-ink-50">
        {count}
      </div>
      <button className="flex-none text-[11px] text-ink-50 hover:text-ink">更改</button>
    </div>
  );
}

function PathArrow() {
  return (
    <div className="flex items-center px-0.5 text-ink-30">
      <ArrowIcon />
    </div>
  );
}

// ─────────────────────────── primary button ───────────────────────────

function PrimaryRunButton({
  count, onClick, disabled
}: { count: number; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-2.5 whitespace-nowrap rounded-md bg-accent px-[18px] py-[11px] text-[13.5px] font-semibold text-white",
        "shadow-pop transition-colors hover:bg-accent/90",
        "disabled:cursor-not-allowed disabled:opacity-60"
      )}
    >
      <PlayIcon />
      <span>处理全部</span>
      <span className="rounded-sm bg-white/20 px-2 py-px font-mono text-[11.5px] font-semibold">
        {count}
      </span>
    </button>
  );
}

// ─────────────────────────── comparison list ───────────────────────────

type RowKind = "ok" | "run" | "queue";

function ComparisonList({ mode, runningCursor }: { mode: Mode; runningCursor: number }) {
  const cols = "grid-cols-[36px_1fr_36px_1fr]";
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-rule bg-card">
      {/* column header */}
      <div className={cn("grid items-center border-b border-rule bg-rule-soft px-4 py-2.5", cols)}>
        <div />
        <ColLabel>供应商 payslip</ColLabel>
        <div />
        <ColLabel>CDP 交付 Payslip</ColLabel>
      </div>
      <div className={cn("grid items-center px-4 pb-2", cols)}>
        <div />
        <div className="font-mono text-[10.5px] text-ink-50">· 原文件 · 只读</div>
        <div />
        <div className="font-mono text-[10.5px] text-ink-50">· 副本 · 已重命名 + 去水印</div>
      </div>

      {/* rows */}
      <div className="flex-1 overflow-auto">
        {ROWS.map((r, i) => {
          const kind: RowKind =
            mode === "done" ? "ok"
            : mode === "running"
              ? (i < runningCursor ? "ok" : i === runningCursor ? "run" : "queue")
              : "queue";
          return (
            <div
              key={r.code}
              className={cn(
                "grid items-center px-4 py-2 last:border-b-0",
                "border-b border-rule-soft",
                cols,
                kind === "run" && "bg-accent/[0.04]"
              )}
            >
              <div className="flex justify-center"><StatusGlyph kind={kind} /></div>
              <PDFChip name={origName(r)} variant="original" />
              <div className="flex items-center justify-center text-ink-30"><ArrowIcon /></div>
              {kind === "ok"
                ? <PDFChip name={newName(r)} variant="result" />
                : kind === "run"
                  ? <RunningChip name={newName(r)} />
                  : <PDFChip name={newName(r)} variant="result" ghost />}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <ListFooter mode={mode} runningCursor={runningCursor} />
    </div>
  );
}

function ColLabel({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <span className="rounded-sm bg-highlight px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-[0.05em] text-ink">
        {children}
      </span>
    </div>
  );
}

function ListFooter({ mode, runningCursor }: { mode: Mode; runningCursor: number }) {
  const total = ROWS.length;
  return (
    <div className="flex items-center gap-3.5 border-t border-rule bg-rule-soft px-4 py-2.5 text-[11.5px] text-ink-50">
      <span className="font-mono">共 {total} 个员工</span>
      <span className="text-ink-30">·</span>
      <span>
        {mode === "ready" && <span className="text-ink">等待处理 {total} 个</span>}
        {mode === "running" && (
          <>
            <span className="font-semibold text-accent">完成 {runningCursor}</span>
            <span className="text-ink-30"> · </span>
            <span className="text-ink">处理中 1</span>
            <span className="text-ink-30"> · </span>
            <span>等待 {total - runningCursor - 1}</span>
          </>
        )}
        {mode === "done" && <span className="font-semibold text-accent">已完成 {total} 个</span>}
      </span>
      <span className="flex-1" />
      {mode === "done" && (
        <>
          <span className="font-mono">用时 6.42s</span>
          <span className="text-ink-30">·</span>
          <button className="text-accent hover:underline">在文件夹中显示</button>
          <span className="text-ink-30">·</span>
          <button className="text-accent hover:underline">打包 ZIP</button>
        </>
      )}
    </div>
  );
}

// ─────────────────────────── row primitives ───────────────────────────

function StatusGlyph({ kind }: { kind: RowKind }) {
  if (kind === "ok") {
    return (
      <div className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-accent text-white">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 5.4l2 2 4-4.5"
            stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }
  if (kind === "run") {
    return (
      <div className="relative h-[18px] w-[18px] rounded-full border-[1.5px] border-accent bg-card">
        <div className="absolute inset-[1px] rounded-full border-2 border-transparent border-t-accent" />
      </div>
    );
  }
  return <div className="h-[18px] w-[18px] rounded-full border border-dashed border-ink-10 bg-card" />;
}

function PDFChip({
  name, variant, ghost
}: { name: string; variant: "original" | "result"; ghost?: boolean }) {
  const isOriginal = variant === "original";
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2.5 rounded-md border px-2.5 py-1.5",
        ghost ? "border-transparent bg-transparent opacity-50" : "border-rule bg-card",
        !ghost && "cursor-pointer hover:border-ink-10"
      )}
    >
      <div
        className={cn(
          "flex h-[26px] w-[22px] flex-none items-center justify-center rounded-sm border font-mono text-[7.5px] font-bold tracking-wide",
          isOriginal
            ? "border-err/30 bg-err/10 text-err"
            : "border-accent/30 bg-accent-soft text-accent"
        )}
      >
        PDF
      </div>
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-mono text-[12px]",
          ghost ? "text-ink-50" : "text-ink"
        )}
      >
        {name}
      </span>
      {!ghost && (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="flex-none text-ink-50">
          <path d="M7 1.5h3.5V5M10.2 1.8L5.5 6.5M5 2.5H2A.5.5 0 001.5 3v7a.5.5 0 00.5.5h7a.5.5 0 00.5-.5V7"
            stroke="currentColor" strokeWidth="1.1"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

function RunningChip({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-accent/30 bg-accent-soft px-2.5 py-1.5">
      <div className="flex h-[26px] w-[22px] flex-none items-center justify-center rounded-sm border border-dashed border-accent bg-card font-mono text-[7.5px] font-bold text-accent">
        ···
      </div>
      <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-70">{name}</span>
      <span className="flex-none font-mono text-[11px] text-accent">正在写入…</span>
    </div>
  );
}

// ─────────────────────────── icons ───────────────────────────

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M1.6 4a1 1 0 011-1H6l1.5 1.5h6a1 1 0 011 1V12a1 1 0 01-1 1H2.6a1 1 0 01-1-1V4z"
        stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 7h10M8 3l4 4-4 4"
        stroke="currentColor" strokeWidth="1.3"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path d="M5 4h7l4 4v8a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z"
        stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M12 4v4h4" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M3 2v10l8-5L3 2z" fill="currentColor" />
    </svg>
  );
}
