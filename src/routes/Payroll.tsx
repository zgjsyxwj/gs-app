import { useEffect, useMemo, useRef, useState } from "react";
import { taskById } from "@/tasks/registry";
import { taskShort } from "@/tasks/labels";
import { ipc, type RunEvent } from "@/lib/ipc";
import { PickerButton } from "@/components/ui/PickerButton";
import { cn, formatMs } from "@/lib/utils";

type Mode = "ready" | "running" | "done";
type RowKind = "ok" | "run" | "queue";

type SourceSheet = { name: string };
type Split = {
  id: string;
  outSuffix: string;
  desc: string;
  sheets: SourceSheet[];
};

// 4 个输出文件 · 5 个 sheet 参与拆分 (salary 合并 2 个) — 与 direction-a-payroll.jsx 一致
const SPLITS: Split[] = [
  {
    id: "salary",
    outSuffix: "Varian_Salary Report.xlsx",
    desc: "部门薪资总表 + 员工薪资表",
    sheets: [{ name: "部門薪資總表" }, { name: "員工薪資表" }],
  },
  {
    id: "ot",
    outSuffix: "Varian_OT Details Report.xlsx",
    desc: "员工加班费明细表",
    sheets: [{ name: "員工加班費明細表" }],
  },
  {
    id: "social",
    outSuffix: "Varian_Social Details Report.xlsx",
    desc: "保险资料明细",
    sheets: [{ name: "保險資料明細" }],
  },
  {
    id: "variance",
    outSuffix: "Varian_Variance Report.xlsx",
    desc: "薪资差异分析表",
    sheets: [{ name: "薪資差異分析表" }],
  },
];

const outName = (s: Split, period: string) => `${period || "yyyyMM"}_${s.outSuffix}`;

function defaultPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const isValidPeriod = (p: string) => /^\d{4}(0[1-9]|1[0-2])$/.test(p);

function parentDir(path: string): string {
  const sep = path.includes("\\") ? "\\" : "/";
  const idx = path.lastIndexOf(sep);
  return idx > 0 ? path.slice(0, idx) : path;
}

const DEFAULT_PASSWORD = "twpayroll";
const EXPECTED_SHEETS = SPLITS.flatMap((s) => s.sheets.map((sh) => sh.name));

export default function Payroll() {
  const task = taskById("va-pay")!;

  const [srcPath, setSrcPath] = useState<string | null>(null);
  const [outDir, setOutDir] = useState<string | null>(null);
  const [period, setPeriod] = useState<string>(defaultPeriod);
  const [password, setPassword] = useState<string>(DEFAULT_PASSWORD);
  const [showPwd, setShowPwd] = useState(false);
  const [sheetMissing, setSheetMissing] = useState<string[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("ready");
  const [runId, setRunId] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: SPLITS.length });
  const [outputs, setOutputs] = useState<string[]>([]);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [runOk, setRunOk] = useState<boolean | null>(null);
  const [zipping, setZipping] = useState(false);

  // 监听一次、按 runId 过滤 — 与 Payslip 一致，避免重订阅竞态。
  const runIdRef = useRef<string | null>(null);
  runIdRef.current = runId;
  useEffect(() => {
    let off: (() => void) | undefined;
    let cancelled = false;
    ipc
      .onRunEvent((ev: RunEvent) => {
        if (cancelled) return;
        if (!runIdRef.current || ev.id !== runIdRef.current) return;
        if (ev.event === "progress") {
          setProgress({ done: ev.done, total: ev.total });
        } else if (ev.event === "log") {
          if (ev.lvl === "err") setErrors((p) => [...p, ev.msg]);
          else if (ev.lvl === "warn") setWarnings((p) => [...p, ev.msg]);
        } else if (ev.event === "done") {
          setOutputs(ev.outputs ?? []);
          setWarnings((p) => [...p, ...(ev.warnings ?? [])]);
          setDurationMs(ev.duration_ms ?? null);
          setRunOk(ev.ok);
          setMode("done");
        }
      })
      .then((unlisten) => {
        if (cancelled) unlisten();
        else off = unlisten;
      });
    return () => {
      cancelled = true;
      off?.();
    };
  }, []);

  const periodValid = isValidPeriod(period);
  // outDir 可省略 — 没选时默认用源文件所在目录
  const effectiveOutDir = outDir ?? (srcPath ? parentDir(srcPath) : null);
  const canRun = !!srcPath && periodValid && password.length > 0 && mode === "ready";

  async function pickSource() {
    const p = await ipc.pickFile(task.inputs);
    if (!p) return;
    setSrcPath(p);
    setScanError(null);
    setSheetMissing([]);
    try {
      const sheets = await ipc.payrollScan(p);
      const have = new Set(sheets);
      setSheetMissing(EXPECTED_SHEETS.filter((n) => !have.has(n)));
    } catch (e) {
      setScanError(String(e));
    }
  }
  async function pickOutput() {
    const d = await ipc.pickFolder();
    if (d) setOutDir(d);
  }
  async function handleRun() {
    if (!canRun || !srcPath || !effectiveOutDir) return;
    setMode("running");
    setProgress({ done: 0, total: SPLITS.length });
    setOutputs([]);
    setWarnings([]);
    setErrors([]);
    setDurationMs(null);
    setRunOk(null);
    try {
      const id = await ipc.startRun({
        taskId: "va-pay",
        input: srcPath,
        outputDir: effectiveOutDir,
        options: { period, password },
      });
      setRunId(id);
    } catch (e) {
      setMode("ready");
      setErrors((p) => [...p, `启动任务失败：${e}`]);
    }
  }
  async function handleCancel() {
    if (!runId) return;
    try {
      await ipc.cancelRun(runId);
    } catch (e) {
      setErrors((p) => [...p, `取消失败：${e}`]);
    }
  }
  function handleReset() {
    setMode("ready");
    setRunId(null);
    setOutputs([]);
    setProgress({ done: 0, total: SPLITS.length });
    setDurationMs(null);
    setWarnings([]);
    setErrors([]);
    setRunOk(null);
  }
  async function handleShowFolder() {
    if (!effectiveOutDir) return;
    try {
      await ipc.revealInFolder(effectiveOutDir);
    } catch (e) {
      setErrors((p) => [...p, `打开文件夹失败：${e}`]);
    }
  }
  async function handleZip() {
    if (!effectiveOutDir || outputs.length === 0 || zipping) return;
    const sep = effectiveOutDir.includes("\\") ? "\\" : "/";
    const trimmed = effectiveOutDir.replace(/[/\\]+$/, "");
    const parent = trimmed.split(sep).slice(0, -1).join(sep) || sep;
    const label = taskShort("va-pay", task.name).replace(/[/\\:*?"<>|]/g, "_");
    const stamp = `${period}_${zipTimestamp(new Date())}`;
    const zipPath = `${parent}${sep}${label}_${stamp}.zip`;
    setZipping(true);
    try {
      const created = await ipc.zipFiles(outputs, zipPath);
      await ipc.revealInFolder(created);
    } catch (e) {
      setErrors((p) => [...p, `打包失败：${e}`]);
    } finally {
      setZipping(false);
    }
  }

  const generatedNames = useMemo(
    () => new Set(outputs.map((p) => p.split(/[/\\]/).pop() ?? "")),
    [outputs]
  );

  // 把 sidecar 的 done/total 线性映射到 4 个 split 行 — sidecar 当前是
  // 占位实现 (total=5)，与 split 数量不一致很正常；映射到位置仍然能给
  // 用户一个推进的视觉反馈。
  function rowKindAt(idx: number): RowKind {
    if (mode === "done") return "ok";
    if (mode === "running") {
      const pos = (progress.done / Math.max(1, progress.total)) * SPLITS.length;
      if (idx < Math.floor(pos)) return "ok";
      if (idx === Math.floor(pos)) return "run";
      return "queue";
    }
    return "queue";
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <Header />

      {/* path bar */}
      <div className="flex items-stretch gap-2.5 px-8 pt-3.5">
        <PathField
          kind="source"
          label="供应商账单"
          path={srcPath ?? "请选择 .xlsx 文件"}
          placeholder={srcPath == null}
          onChange={pickSource}
        />
        <PathArrow />
        <PathField
          kind="output"
          label="CDP 交付"
          path={outDir ?? (srcPath ? `${parentDir(srcPath)}（默认）` : "默认与来源同目录")}
          placeholder={outDir == null}
          onChange={pickOutput}
        />
      </div>

      {errors.length > 0 && (
        <div className="mx-8 mt-3 rounded-md border border-err/30 bg-err/10 px-4 py-2 font-mono text-[11.5px] text-err">
          {errors.length === 1
            ? errors[0]
            : `${errors.length} 条错误 · 最新：${errors[errors.length - 1]}`}
        </div>
      )}

      {scanError && (
        <div className="mx-8 mt-3 rounded-md border border-warn/40 bg-warn/10 px-4 py-2 text-[11.5px] text-warn">
          <b>无法读取工作表：</b> <span className="font-mono">{scanError}</span>
        </div>
      )}

      {sheetMissing.length > 0 && !scanError && (
        <div className="mx-8 mt-3 rounded-md border border-warn/40 bg-warn/10 px-4 py-2 text-[11.5px] text-warn">
          <b>账单缺少预期 sheet：</b> <span className="font-mono">{sheetMissing.join(" · ")}</span>
          <span className="text-warn/80"> · 请确认上传的文件是否正确</span>
        </div>
      )}

      <ActionBar
        mode={mode}
        period={period}
        onChangePeriod={setPeriod}
        periodValid={periodValid}
        password={password}
        onChangePassword={setPassword}
        showPwd={showPwd}
        onToggleShowPwd={() => setShowPwd((v) => !v)}
        canRun={canRun}
        onRun={handleRun}
        onCancel={handleCancel}
        onShowFolder={handleShowFolder}
        onZip={handleZip}
        onReset={handleReset}
        zipping={zipping}
        canShowFolder={!!effectiveOutDir}
        canZip={outputs.length > 0}
      />

      <StatusBar
        mode={mode}
        runOk={runOk}
        durationMs={durationMs}
        outputCount={outputs.length}
        progress={progress}
        warningCount={warnings.length}
      />

      {/* mapping table */}
      <div className="flex min-h-0 flex-1 px-8 pb-[18px] pt-3">
        <MappingTable
          period={period}
          mode={mode}
          rowKindAt={rowKindAt}
          generatedNames={generatedNames}
          durationMs={durationMs}
          progress={progress}
        />
      </div>
    </div>
  );
}

// ─────────────────────────── header ───────────────────────────

function Header() {
  return (
    <div className="border-b border-rule-soft px-8 pb-4 pt-5">
      <div className="flex items-center gap-2 text-[11px] text-ink-50">
        <span>处理任务</span>
        <span className="text-ink-30">/</span>
        <span className="font-mono">VA-PAY</span>
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-6">
        <div className="min-w-0">
          <h1 className="m-0 mb-1 text-[20px] font-semibold tracking-[-0.01em]">
            瓦里安 · Payroll 账单拆分
          </h1>
          <div className="max-w-[760px] text-[12.5px] leading-[1.55] text-ink-50">
            将供应商提供的合并账单按 sheet 拆分为多个独立 Excel · 输出文件自动加密 ·
            原始文件不会被修改
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── path field ───────────────────────────

function PathField({
  kind,
  label,
  path,
  placeholder,
  onChange,
}: {
  kind: "source" | "output";
  label: string;
  path: string;
  placeholder?: boolean;
  onChange: () => void;
}) {
  const isOutput = kind === "output";
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 rounded-md border border-rule bg-card px-3.5 py-2.5">
      <span
        className={cn(
          "flex-none text-[10.5px] font-semibold uppercase leading-none tracking-[0.08em]",
          isOutput ? "text-accent" : "text-ink-50"
        )}
      >
        {isOutput ? "输出" : "来源"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-ink-50">
          {label}
        </div>
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

function PathArrow() {
  return (
    <div className="flex items-center px-0.5 text-ink-30">
      <ArrowIcon />
    </div>
  );
}

// ─────────────────────────── action bar ───────────────────────────

function ActionBar({
  mode,
  period,
  onChangePeriod,
  periodValid,
  password,
  onChangePassword,
  showPwd,
  onToggleShowPwd,
  canRun,
  onRun,
  onCancel,
  onShowFolder,
  onZip,
  onReset,
  zipping,
  canShowFolder,
  canZip,
}: {
  mode: Mode;
  period: string;
  onChangePeriod: (v: string) => void;
  periodValid: boolean;
  password: string;
  onChangePassword: (v: string) => void;
  showPwd: boolean;
  onToggleShowPwd: () => void;
  canRun: boolean;
  onRun: () => void;
  onCancel: () => void;
  onShowFolder: () => void;
  onZip: () => void;
  onReset: () => void;
  zipping: boolean;
  canShowFolder: boolean;
  canZip: boolean;
}) {
  const inputsDisabled = mode === "running";
  return (
    <div className="mx-8 mt-3.5 flex flex-wrap items-center gap-3.5 rounded-lg border border-rule bg-card px-3.5 py-3 pl-4">
      <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-accent-soft text-accent">
        <LockIcon size={15} />
      </div>

      <InputField label="薪资年月" invalid={!periodValid && period.length > 0}>
        <input
          type="text"
          value={period}
          placeholder="yyyyMM"
          maxLength={6}
          disabled={inputsDisabled}
          onChange={(e) => onChangePeriod(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className={cn(
            "w-[86px] border-none bg-transparent font-mono text-[12.5px] tracking-[1px] text-ink",
            "outline-none placeholder:text-ink-30 disabled:cursor-not-allowed disabled:opacity-60"
          )}
        />
      </InputField>

      <div className="hidden h-8 w-px self-end bg-rule sm:block" />

      <InputField label="输出加密密码">
        <input
          type={showPwd ? "text" : "password"}
          value={password}
          placeholder="设置一个密码"
          disabled={inputsDisabled}
          onChange={(e) => onChangePassword(e.target.value)}
          className={cn(
            "w-[200px] border-none bg-transparent font-mono text-[12.5px] text-ink",
            "outline-none placeholder:text-ink-30 disabled:cursor-not-allowed disabled:opacity-60",
            !showPwd && "tracking-[2px]"
          )}
        />
        <button
          type="button"
          onClick={onToggleShowPwd}
          title={showPwd ? "隐藏密码" : "显示密码"}
          className="flex items-center px-1.5 py-1 text-ink-50 hover:text-ink"
        >
          <EyeIcon open={!showPwd} />
        </button>
      </InputField>

      <span className="flex-1" />

      {mode === "done" ? (
        <div className="flex items-center gap-2">
          <SecondaryButton onClick={onShowFolder} disabled={!canShowFolder} icon={<FolderIcon />}>
            打开输出文件夹
          </SecondaryButton>
          <SecondaryButton onClick={onZip} disabled={!canZip || zipping} icon={<ZipIcon />}>
            {zipping ? "打包中…" : "打包 ZIP"}
          </SecondaryButton>
          <PrimaryButton onClick={onReset} icon={<RefreshIcon />}>
            再运行一次
          </PrimaryButton>
        </div>
      ) : mode === "running" ? (
        <SecondaryButton onClick={onCancel} icon={<XIcon />}>
          取消处理
        </SecondaryButton>
      ) : (
        <PrimaryButton onClick={onRun} disabled={!canRun} icon={<PlayIcon />}>
          开始拆分
        </PrimaryButton>
      )}
    </div>
  );
}

function InputField({
  label,
  invalid,
  children,
}: {
  label: string;
  invalid?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-ink-50">
        {label}
      </label>
      <div
        className={cn(
          "flex h-[30px] items-center gap-1 rounded-md border bg-card pl-2.5 pr-1",
          invalid ? "border-err/40" : "border-ink-10"
        )}
      >
        {children}
      </div>
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  icon,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-2 whitespace-nowrap rounded-md bg-accent px-[18px] py-[9px]",
        "text-[13px] font-semibold text-white shadow-pop transition-colors hover:bg-accent/90",
        "disabled:cursor-not-allowed disabled:opacity-60"
      )}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
  disabled,
  icon,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded border border-ink-10 bg-card px-3 py-[7px]",
        "text-[12.5px] font-medium text-ink hover:bg-black/[0.03]",
        "disabled:cursor-not-allowed disabled:opacity-50"
      )}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

// ─────────────────────────── status bar ───────────────────────────

function StatusBar({
  mode,
  runOk,
  durationMs,
  outputCount,
  progress,
  warningCount,
}: {
  mode: Mode;
  runOk: boolean | null;
  durationMs: number | null;
  outputCount: number;
  progress: { done: number; total: number };
  warningCount: number;
}) {
  if (mode === "done") {
    const ok = runOk !== false;
    return (
      <div
        className={cn(
          "mx-8 mt-2.5 flex items-center gap-2.5 rounded-md border px-3.5 py-2.5 text-[12px]",
          ok ? "border-accent/30 bg-accent-soft text-ink-70" : "border-err/30 bg-err/10 text-err"
        )}
      >
        <div
          className={cn(
            "flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-white",
            ok ? "bg-accent" : "bg-err"
          )}
        >
          {ok ? <CheckIcon /> : <XIcon />}
        </div>
        <span>
          <b className="text-ink">{ok ? "处理完成" : "处理失败"}</b>
          {ok && (
            <>
              {" · "}
              <span className="font-mono">{outputCount}</span> 个加密 Excel 已生成
              {durationMs != null && (
                <>
                  {" · 用时 "}
                  <span className="font-mono">{formatMs(durationMs)}</span>
                </>
              )}
              {warningCount > 0 && (
                <>
                  {" · "}
                  <span className="text-warn">{warningCount} 条警告</span>
                </>
              )}
            </>
          )}
        </span>
        <span className="flex-1" />
      </div>
    );
  }

  if (mode === "running") {
    const pct = Math.round((progress.done / Math.max(1, progress.total)) * 100);
    return (
      <div className="mx-8 mt-2.5 flex items-center gap-2.5 rounded-md border border-rule bg-card px-3.5 py-2.5 text-[12px] text-ink-70">
        <SpinnerSmall />
        <span>
          <b className="text-ink">正在拆分</b>
          {" · "}
          <span className="font-mono">
            {progress.done} / {progress.total}
          </span>
        </span>
        <span className="flex-1" />
        <span className="font-mono text-[11px] text-ink-50">{pct}%</span>
      </div>
    );
  }

  return (
    <div className="mx-8 mt-2.5 flex items-center gap-2.5 rounded-md border border-rule bg-card px-3.5 py-2.5 text-[12px] text-ink-70">
      <ClockIcon />
      <span>
        就绪 · <span className="font-mono">{SPLITS.length}</span> 个文件待生成 ·
        按映射规则拆分并加密 · 原始文件不会改动
      </span>
      <span className="flex-1" />
      <span className="font-mono text-[11px] text-ink-50">完成后可一键打开目录 / 打包 ZIP</span>
    </div>
  );
}

// ─────────────────────────── mapping table ───────────────────────────

function MappingTable({
  period,
  mode,
  rowKindAt,
  generatedNames,
  durationMs,
  progress,
}: {
  period: string;
  mode: Mode;
  rowKindAt: (idx: number) => RowKind;
  generatedNames: Set<string>;
  durationMs: number | null;
  progress: { done: number; total: number };
}) {
  const cols = "grid-cols-[32px_minmax(0,1.05fr)_36px_minmax(0,1fr)_92px]";
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-rule bg-card">
      {/* header */}
      <div
        className={cn(
          "grid items-center border-b border-rule bg-rule-soft px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-50",
          cols
        )}
      >
        <div />
        <div className="flex items-center gap-2">
          <span className="rounded-sm bg-highlight px-1.5 py-px text-ink">
            供应商账单 · 来源 sheet
          </span>
          <span className="font-mono text-[10.5px] normal-case tracking-normal">
            · 原文件 · 只读
          </span>
        </div>
        <div />
        <div className="flex items-center gap-2">
          <span className="rounded-sm bg-highlight px-1.5 py-px text-ink">CDP 交付 Excel</span>
          <span className="font-mono text-[10.5px] normal-case tracking-normal">· 副本 · 加密</span>
        </div>
        <div className="text-right">状态</div>
      </div>

      {/* rows */}
      <div className="flex-1 overflow-auto">
        {SPLITS.map((s, i) => {
          const kind = rowKindAt(i);
          const expectedName = outName(s, period);
          const generated = mode === "done" && generatedNames.has(expectedName);
          const isLast = i === SPLITS.length - 1;
          return (
            <div
              key={s.id}
              className={cn(
                "grid items-center px-4 py-2",
                !isLast && "border-b border-rule-soft",
                kind === "run" && "bg-accent/[0.04]",
                cols
              )}
            >
              <div className="flex justify-center">
                <StatusGlyph kind={kind} />
              </div>

              {/* source sheets */}
              <div className="flex min-w-0 flex-col gap-1.5">
                {s.sheets.map((sh) => (
                  <SheetChip key={sh.name} sheet={sh} />
                ))}
              </div>

              {/* arrow */}
              <div className="flex justify-center text-ink-30">
                <ArrowIcon />
              </div>

              {/* output file card */}
              <OutputCard name={expectedName} desc={s.desc} kind={kind} generated={generated} />

              {/* status badge */}
              <div className="text-right">
                <StatusBadge kind={kind} />
              </div>
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div className="flex items-center gap-3.5 border-t border-rule bg-rule-soft px-4 py-2.5 text-[11.5px] text-ink-50">
        <span className="font-mono">拆分为 {SPLITS.length} 个文件</span>
        <span className="flex-1" />
        {mode === "done" && (
          <span className="font-mono font-semibold text-accent">
            全部完成{durationMs != null && ` · 用时 ${formatMs(durationMs)}`}
          </span>
        )}
        {mode === "running" && (
          <span className="font-mono">
            <span className="font-semibold text-accent">
              完成{" "}
              {Math.min(
                SPLITS.length,
                Math.floor((progress.done / Math.max(1, progress.total)) * SPLITS.length)
              )}
            </span>
            <span className="text-ink-30"> · </span>
            <span className="text-ink">处理中 1</span>
            <span className="text-ink-30"> · </span>
            <span className="text-ink-50">
              等待{" "}
              {Math.max(
                0,
                SPLITS.length -
                  Math.floor((progress.done / Math.max(1, progress.total)) * SPLITS.length) -
                  1
              )}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

function SheetChip({ sheet }: { sheet: SourceSheet }) {
  return (
    <div className="inline-flex w-fit items-center gap-2 rounded border border-rule bg-card py-[5px] pl-2 pr-2.5">
      <div className="h-3.5 w-1 rounded-sm bg-ink-30" />
      <span className="text-[12px] font-medium text-ink">{sheet.name}</span>
    </div>
  );
}

function OutputCard({
  name,
  desc,
  kind,
  generated,
}: {
  name: string;
  desc: string;
  kind: RowKind;
  generated: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2.5 rounded border px-2.5 py-2",
        kind === "ok"
          ? "border-accent/30 bg-accent-soft"
          : kind === "run"
            ? "border-accent bg-card"
            : "border-rule bg-card"
      )}
    >
      <XlsxBadge tone={kind === "queue" ? "neutral" : "accent"} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-[12px] font-medium text-ink">{name}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-ink-50">
          <LockIcon size={9} muted={kind === "queue"} />
          <span className="font-mono">加密</span>
          <span className="text-ink-30">·</span>
          <span className="truncate">{desc}</span>
          {generated && (
            <>
              <span className="text-ink-30">·</span>
              <span className="font-mono text-accent">已写入</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function XlsxBadge({ tone }: { tone: "accent" | "neutral" }) {
  const isAccent = tone === "accent";
  return (
    <div
      className={cn(
        "flex h-[26px] w-[22px] flex-none items-center justify-center rounded-sm border font-mono text-[8.5px] font-bold tracking-wide",
        isAccent
          ? "border-accent/30 bg-accent-soft text-accent"
          : "border-ink-10 bg-panel text-ink-30"
      )}
    >
      XLSX
    </div>
  );
}

function StatusBadge({ kind }: { kind: RowKind }) {
  if (kind === "ok") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-[3px] font-mono text-[10.5px] font-semibold text-accent">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        完成
      </span>
    );
  }
  if (kind === "run") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-accent bg-card px-2.5 py-[3px] font-mono text-[10.5px] font-semibold text-accent">
        处理中
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-dashed border-ink-10 bg-card px-2.5 py-[3px] font-mono text-[10.5px] text-ink-50">
      待处理
    </span>
  );
}

// ─────────────────────────── status glyphs / icons ───────────────────────────

function StatusGlyph({ kind }: { kind: RowKind }) {
  if (kind === "ok") {
    return (
      <div className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-accent text-white">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path
            d="M2 5.4l2 2 4-4.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }
  if (kind === "run") {
    return (
      <div className="relative h-[18px] w-[18px] rounded-full border-[1.5px] border-accent bg-card">
        <div className="absolute -inset-[2px] animate-spin rounded-full border-2 border-transparent border-t-accent" />
      </div>
    );
  }
  return (
    <div className="h-[18px] w-[18px] rounded-full border border-dashed border-ink-10 bg-card" />
  );
}

function SpinnerSmall() {
  return (
    <div className="relative h-[16px] w-[16px] flex-none rounded-full border-[1.5px] border-accent/40">
      <div className="absolute -inset-[2px] animate-spin rounded-full border-2 border-transparent border-t-accent" />
    </div>
  );
}

// ─────────────────────────── icons ───────────────────────────

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M2 7h10M8 3l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon({ size = 11, muted = false }: { size?: number; muted?: boolean }) {
  return (
    <svg
      width={size}
      height={size + 1}
      viewBox="0 0 12 13"
      fill="none"
      className={cn("flex-none", muted ? "text-ink-30" : "text-accent")}
    >
      <rect x="2" y="6" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M4 6V4a2 2 0 014 0v2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="6" cy="9" r="0.8" fill="currentColor" />
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      {open ? (
        <>
          <path
            d="M1.5 8s2.5-5 6.5-5 6.5 5 6.5 5-2.5 5-6.5 5S1.5 8 1.5 8z"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
        </>
      ) : (
        <path
          d="M1.5 8s2.5-5 6.5-5 6.5 5 6.5 5-2.5 5-6.5 5S1.5 8 1.5 8z M8 6a2 2 0 100 4 2 2 0 000-4z M2 2l12 12"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path d="M3 2v10l8-5L3 2z" fill="currentColor" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path
        d="M7 2v8M7 2L4 5M7 2l3 3M2 11.5h10"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path
        d="M1.5 4.5a1 1 0 011-1h2.2l1 1.2H11.5a1 1 0 011 1V11a1 1 0 01-1 1h-9a1 1 0 01-1-1V4.5z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ZipIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <rect x="3" y="2" width="8" height="11" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M6 4h2M6 6h2M6 8h2M6 10h2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d="M3 6.5l2 2 4-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-none text-ink-50">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M7 4v3.5l2 1.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

// ─────────────────────────── helpers ───────────────────────────

function zipTimestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}
