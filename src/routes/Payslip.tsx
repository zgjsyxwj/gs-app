import { useEffect, useMemo, useRef, useState } from "react";
import { taskById } from "@/tasks/registry";
import { taskShort } from "@/tasks/labels";
import { ipc, type PayslipRow, type RunEvent } from "@/lib/ipc";
import { PickerButton } from "@/components/ui/PickerButton";
import { cn } from "@/lib/utils";

type Mode = "ready" | "running" | "done";

export default function Payslip() {
  const task = taskById("va-vn-ps")!;

  const [srcDir, setSrcDir] = useState<string | null>(null);
  const [outDir, setOutDir] = useState<string | null>(null);
  const [rows, setRows] = useState<PayslipRow[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("ready");
  const [runId, setRunId] = useState<string | null>(null);
  const [progressDone, setProgressDone] = useState(0);
  const [currentCode, setCurrentCode] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<string[]>([]);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [runOk, setRunOk] = useState<boolean | null>(null);
  const [zipping, setZipping] = useState(false);

  // Event subscription is owned by the component lifecycle, not the run. We
  // attach once and filter by the active runId — that way subscribing again
  // for a second run doesn't race the unsubscribe of the first.
  const runIdRef = useRef<string | null>(null);
  runIdRef.current = runId;
  useEffect(() => {
    let off: (() => void) | undefined;
    let cancelled = false;
    ipc.onRunEvent((ev: RunEvent) => {
      if (cancelled) return;
      if (!runIdRef.current || ev.id !== runIdRef.current) return;
      if (ev.event === "progress") {
        setProgressDone(ev.done);
        setCurrentCode(ev.note || null);
      } else if (ev.event === "log") {
        // 把 err/warn 收集起来在 UI 顶部呈现 — 这样 sidecar 失败时
        // 用户能看到原因，而不是面对一个"完成 0 个"的空结果发呆。
        if (ev.lvl === "err") setErrors(prev => [...prev, ev.msg]);
        else if (ev.lvl === "warn") setWarnings(prev => [...prev, ev.msg]);
      } else if (ev.event === "done") {
        setOutputs(ev.outputs ?? []);
        setWarnings(prev => [...prev, ...(ev.warnings ?? [])]);
        setDurationMs(ev.duration_ms ?? null);
        setRunOk(ev.ok);
        setMode("done");
        setCurrentCode(null);
      }
    }).then(unlisten => {
      if (cancelled) unlisten();
      else off = unlisten;
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }, []);

  // Derive a period label from the first row's mon/year (all rows in a folder
  // share the same period in practice; if mixed, we just show the first).
  const period = useMemo(() => {
    if (!rows.length) return null;
    return `${rows[0].mon} ${rows[0].year}`;
  }, [rows]);

  async function pickSource() {
    const dir = await ipc.pickFolder();
    if (!dir) return;
    setSrcDir(dir);
    setScanError(null);
    setMode("ready");
    setOutputs([]);
    setDurationMs(null);
    try {
      const scan = await ipc.payslipScan(dir);
      setRows(scan.rows);
      setSkipped(scan.skipped);
    } catch (e) {
      setRows([]);
      setSkipped([]);
      setScanError(String(e));
    }
  }

  async function pickOutput() {
    const dir = await ipc.pickFolder();
    if (!dir) return;
    setOutDir(dir);
  }

  async function handleRun() {
    if (!srcDir || !outDir || rows.length === 0) return;
    setMode("running");
    setProgressDone(0);
    setCurrentCode(rows[0]?.code ?? null);
    setOutputs([]);
    setWarnings([]);
    setErrors([]);
    setDurationMs(null);
    setRunOk(null);
    try {
      const id = await ipc.startRun({
        taskId: "va-vn-ps",
        input: srcDir,
        outputDir: outDir,
        options: {},
      });
      setRunId(id);
    } catch (e) {
      setMode("ready");
      setErrors(prev => [...prev, `启动任务失败：${e}`]);
    }
  }

  async function showOutputFolder() {
    if (!outDir) return;
    try {
      await ipc.revealInFolder(outDir);
    } catch (e) {
      setErrors(prev => [...prev, `打开文件夹失败：${e}`]);
    }
  }

  async function packageZip() {
    if (!outDir || outputs.length === 0 || zipping) return;
    // 文件名 = 菜单短名 + 当前时间戳。只打包真实生成的文件（outputs[]），
    // 不扫整个输出目录 — 避免把同目录里别的东西一起带走。
    // 路径：放在 outDir 同级（父目录里），用户更容易看到。
    const sep = outDir.includes("\\") ? "\\" : "/";
    const trimmed = outDir.replace(/[/\\]+$/, "");
    const parent = trimmed.split(sep).slice(0, -1).join(sep) || sep;
    const label = taskShort("va-vn-ps", task.name).replace(/[/\\:*?"<>|]/g, "_");
    const zipBase = `${label}_${zipTimestamp(new Date())}.zip`;
    const zipPath = `${parent}${sep}${zipBase}`;
    setZipping(true);
    try {
      const created = await ipc.zipFiles(outputs, zipPath);
      await ipc.revealInFolder(created);
    } catch (e) {
      setErrors(prev => [...prev, `打包失败：${e}`]);
    } finally {
      setZipping(false);
    }
  }

  // 把 outputs 路径列表化为文件名集合 — 用于判断每一行是否真的产出了文件，
  // 而不是单纯按"任务结束 == 全部成功"来标记。
  const generatedNames = useMemo(
    () => new Set(outputs.map(p => p.split(/[/\\]/).pop() ?? "")),
    [outputs],
  );

  const canRun = !!srcDir && !!outDir && rows.length > 0 && mode === "ready";
  const subtitle = period
    ? `${period} · 复制每个供应商 PDF → 按 {code}_{YYYYMM}.pdf 重命名 → 清除底部水印。原始文件不会被修改。`
    : "复制每个供应商 PDF → 按 {code}_{YYYYMM}.pdf 重命名 → 清除底部水印。原始文件不会被修改。";

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <Header subtitle={subtitle} code={task.code} />

      {/* path bar */}
      <div className="flex items-stretch gap-2.5 px-8 pt-3.5">
        <PathField
          kind="source"
          label="来源 · 供应商 payslip"
          path={srcDir ?? "请选择文件夹"}
          placeholder={srcDir == null}
          onChange={pickSource}
        />
        <PathArrow />
        <PathField
          kind="output"
          label="输出 · CDP 交付"
          path={outDir ?? "请选择文件夹"}
          placeholder={outDir == null}
          onChange={pickOutput}
        />
      </div>

      {scanError && (
        <div className="mx-8 mt-3 rounded-md border border-err/30 bg-err/10 px-4 py-2 text-[12px] text-err">
          {scanError}
        </div>
      )}
      {errors.length > 0 && (
        <div className="mx-8 mt-3 rounded-md border border-err/30 bg-err/10 px-4 py-2 font-mono text-[11.5px] text-err">
          {errors.length === 1 ? errors[0] : `${errors.length} 条错误 · 最新：${errors[errors.length - 1]}`}
        </div>
      )}
      {mode === "done" && outputs.length === 0 && (
        <div className="mx-8 mt-3 rounded-md border border-warn/30 bg-warn-soft px-4 py-2 text-[12px] text-warn">
          任务结束，但没有生成任何文件。请检查上方错误，或确认 sidecar 已连接、来源目录可读、输出目录可写。
        </div>
      )}
      {skipped.length > 0 && (
        <div className="mx-8 mt-3 rounded-md border border-rule bg-panel px-4 py-2 text-[12px] text-ink-50">
          已忽略 {skipped.length} 个不匹配命名的文件：
          <span className="ml-2 font-mono text-ink-70">{skipped.slice(0, 3).join(", ")}</span>
          {skipped.length > 3 && <span className="text-ink-30"> …</span>}
        </div>
      )}

      {/* action strip */}
      <div className="mx-8 mt-3.5 flex items-center gap-[18px] rounded-lg border border-rule bg-card px-[18px] py-3.5">
        <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-accent-soft text-accent">
          <FileIcon />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold text-ink">一键执行：复制 + 重命名 + 去水印</div>
          {!srcDir && (
            <div className="mt-0.5 text-[11.5px] text-ink-50">先选择来源文件夹（供应商 payslip 所在目录）</div>
          )}
          {srcDir && !outDir && (
            <div className="mt-0.5 text-[11.5px] text-ink-50">还需选择输出文件夹（CDP 交付目录）</div>
          )}
        </div>
        <PrimaryRunButton count={rows.length} disabled={!canRun} onClick={handleRun} />
      </div>

      {/* comparison list */}
      <div className="flex min-h-0 flex-1 px-8 pb-[22px] pt-3.5">
        <ComparisonList
          rows={rows}
          mode={mode}
          progressDone={progressDone}
          currentCode={currentCode}
          durationMs={durationMs}
          warnings={warnings}
          generatedNames={generatedNames}
          runOk={runOk}
          zipping={zipping}
          canShowFolder={!!outDir}
          canZip={outputs.length > 0}
          onShowFolder={showOutputFolder}
          onPackageZip={packageZip}
        />
      </div>
    </div>
  );
}

// ─────────────────────────── helpers ───────────────────────────

// 用户本地时区的 YYYYMMDD_HHMMSS — 与 payslip 输出文件名 (Z004xxx_202603.pdf)
// 紧凑风格保持一致；冒号/斜杠会触发 Windows 文件名限制，所以用纯数字。
function zipTimestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
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

function PathField({
  kind, label, path, placeholder, onChange,
}: {
  kind: "source" | "output";
  label: string;
  path: string;
  placeholder?: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 rounded-md border border-rule bg-card px-3.5 py-2.5">
      <FieldTag kind={kind} />
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-ink-50">{label}</div>
        <div
          className={cn(
            "mt-0.5 truncate font-mono text-[12px]",
            placeholder ? "text-ink-30" : "text-ink"
          )}
        >
          {path}
        </div>
      </div>
      <PickerButton variant="path" onClick={onChange} />
    </div>
  );
}

// 字段语义标签 — 纯文字、无背景/边框/圆角。
// 来源用 ink-50，输出用 accent，靠颜色而非装饰传达语义。
function FieldTag({ kind }: { kind: "source" | "output" }) {
  const isOutput = kind === "output";
  return (
    <span
      className={cn(
        "flex-none text-[10.5px] font-semibold uppercase leading-none tracking-[0.8px]",
        isOutput ? "text-accent" : "text-ink-50",
      )}
    >
      {isOutput ? "输出" : "来源"}
    </span>
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

type RowKind = "ok" | "run" | "queue" | "missing";

function ComparisonList({
  rows, mode, progressDone, currentCode, durationMs, warnings,
  generatedNames, runOk, zipping, canShowFolder, canZip, onShowFolder, onPackageZip,
}: {
  rows: PayslipRow[];
  mode: Mode;
  progressDone: number;
  currentCode: string | null;
  durationMs: number | null;
  warnings: string[];
  generatedNames: Set<string>;
  runOk: boolean | null;
  zipping: boolean;
  canShowFolder: boolean;
  canZip: boolean;
  onShowFolder: () => void;
  onPackageZip: () => void;
}) {
  const cols = "grid-cols-[36px_1fr_36px_1fr]";

  if (rows.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-rule bg-card text-center">
        <div className="text-[13px] font-semibold text-ink">尚未选择来源</div>
        <div className="mt-1.5 text-[12px] text-ink-50">
          请在上方「来源」选择存放 payslip PDF 的文件夹
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-rule bg-card">
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

      <div className="flex-1 overflow-auto">
        {rows.map((r) => {
          const kind = rowKind(r, mode, progressDone, currentCode, rows, generatedNames);
          return (
            <div
              key={r.code}
              className={cn(
                "grid items-center px-4 py-2 last:border-b-0",
                "border-b border-rule-soft",
                cols,
                kind === "run" && "bg-accent/[0.04]",
                kind === "missing" && "bg-err/[0.04]"
              )}
            >
              <div className="flex justify-center"><StatusGlyph kind={kind} /></div>
              <PDFChip name={r.orig_name} variant="original" />
              <div className="flex items-center justify-center text-ink-30"><ArrowIcon /></div>
              {kind === "ok"
                ? <PDFChip name={r.new_name} variant="result" />
                : kind === "run"
                  ? <RunningChip name={r.new_name} />
                  : kind === "missing"
                    ? <MissingChip name={r.new_name} />
                    : <PDFChip name={r.new_name} variant="result" ghost />}
            </div>
          );
        })}
      </div>

      <ListFooter
        rows={rows}
        mode={mode}
        progressDone={progressDone}
        durationMs={durationMs}
        warnings={warnings}
        generatedCount={generatedNames.size}
        runOk={runOk}
        zipping={zipping}
        canShowFolder={canShowFolder}
        canZip={canZip}
        onShowFolder={onShowFolder}
        onPackageZip={onPackageZip}
      />
    </div>
  );
}

function rowKind(
  r: PayslipRow,
  mode: Mode,
  progressDone: number,
  currentCode: string | null,
  rows: PayslipRow[],
  generatedNames: Set<string>,
): RowKind {
  if (mode === "done") {
    return generatedNames.has(r.new_name) ? "ok" : "missing";
  }
  if (mode === "running") {
    const idx = rows.findIndex(x => x.code === r.code);
    if (currentCode && r.code === currentCode) return "run";
    if (idx < progressDone) return "ok";
    return "queue";
  }
  return "queue";
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

function ListFooter({
  rows, mode, progressDone, durationMs, warnings,
  generatedCount, runOk, zipping, canShowFolder, canZip,
  onShowFolder, onPackageZip,
}: {
  rows: PayslipRow[];
  mode: Mode;
  progressDone: number;
  durationMs: number | null;
  warnings: string[];
  generatedCount: number;
  runOk: boolean | null;
  zipping: boolean;
  canShowFolder: boolean;
  canZip: boolean;
  onShowFolder: () => void;
  onPackageZip: () => void;
}) {
  const total = rows.length;
  const missing = mode === "done" ? Math.max(0, total - generatedCount) : 0;
  return (
    <div className="flex items-center gap-3.5 border-t border-rule bg-rule-soft px-4 py-2.5 text-[11.5px] text-ink-50">
      <span className="font-mono">共 {total} 个员工</span>
      <span className="text-ink-30">·</span>
      <span>
        {mode === "ready" && <span className="text-ink">等待处理 {total} 个</span>}
        {mode === "running" && (
          <>
            <span className="font-semibold text-accent">完成 {progressDone}</span>
            <span className="text-ink-30"> · </span>
            <span className="text-ink">处理中 1</span>
            <span className="text-ink-30"> · </span>
            <span>等待 {Math.max(0, total - progressDone - 1)}</span>
          </>
        )}
        {mode === "done" && (
          <>
            <span
              className={cn(
                "font-semibold",
                runOk === false || missing > 0 ? "text-err" : "text-accent"
              )}
            >
              {missing > 0
                ? `已生成 ${generatedCount} / ${total} · 缺失 ${missing}`
                : `已完成 ${generatedCount}`}
            </span>
            {warnings.length > 0 && (
              <span className="text-warn"> · {warnings.length} 警告</span>
            )}
          </>
        )}
      </span>
      <span className="flex-1" />
      {mode === "done" && (
        <>
          {durationMs != null && (
            <>
              <span className="font-mono">用时 {(durationMs / 1000).toFixed(2)}s</span>
              <span className="text-ink-30">·</span>
            </>
          )}
          <button
            onClick={onShowFolder}
            disabled={!canShowFolder}
            className="text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
          >
            在文件夹中显示
          </button>
          <span className="text-ink-30">·</span>
          <button
            onClick={onPackageZip}
            disabled={!canZip || zipping}
            className="text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
          >
            {zipping ? "打包中…" : "打包 ZIP"}
          </button>
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
  if (kind === "missing") {
    return (
      <div className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-err text-white">
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
          <path d="M2 2l6 6M8 2l-6 6"
            stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" />
        </svg>
      </div>
    );
  }
  return <div className="h-[18px] w-[18px] rounded-full border border-dashed border-ink-10 bg-card" />;
}

function MissingChip({ name }: { name: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-md border border-err/30 bg-err/[0.06] px-2.5 py-1.5">
      <div className="flex h-[26px] w-[22px] flex-none items-center justify-center rounded-sm border border-err/30 bg-err/10 font-mono text-[7.5px] font-bold tracking-wide text-err">
        ×
      </div>
      <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-err">{name}</span>
      <span className="flex-none font-mono text-[11px] text-err">未生成</span>
    </div>
  );
}

function PDFChip({
  name, variant, ghost
}: { name: string; variant: "original" | "result"; ghost?: boolean }) {
  // 输入和输出都用相同的 err-style 红色 PDF 角标 —— 区分前后靠位置与中间的箭头，
  // 不靠颜色（设计稿调整：成功生成的输出不再用 accent 绿）。
  void variant;
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2.5 rounded-md border px-2.5 py-1.5",
        ghost ? "border-transparent bg-transparent opacity-50" : "border-rule bg-card",
        !ghost && "cursor-pointer hover:border-ink-10"
      )}
    >
      <div
        className="flex h-[26px] w-[22px] flex-none items-center justify-center rounded-sm border border-err/30 bg-err/10 font-mono text-[7.5px] font-bold tracking-wide text-err"
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
