import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { taskById } from "@/tasks/registry";
import { ipc, type RunEvent, type TaskDescriptor } from "@/lib/ipc";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Progress } from "@/components/ui/Progress";
import { Badge } from "@/components/ui/Badge";
import { PickerButton } from "@/components/ui/PickerButton";
import { cn, formatMs } from "@/lib/utils";

type LogLine = { t: string; lvl: "info" | "warn" | "ok" | "err"; msg: string };
type Phase = "input" | "configure" | "running" | "done";
type RunResult = { ok: boolean; durationMs: number; outputs: string[]; warnings: string[] };

const STEPS: { id: Phase; label: string }[] = [
  { id: "input",     label: "选择输入" },
  { id: "configure", label: "处理选项" },
  { id: "running",   label: "正在处理" },
  { id: "done",      label: "处理完成" }
];

export default function Task() {
  const { taskId } = useParams<{ taskId: string }>();
  const task = taskId ? taskById(taskId) : null;

  const [inputPath, setInputPath] = useState<string | null>(null);
  const [outputDir, setOutputDir] = useState("~/Documents/Pivot/Output");
  const [runId, setRunId] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 1, note: "" });
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);
  const [override, setOverride] = useState<Phase | null>(null);
  const runStartRef = useRef<number | null>(null);

  useEffect(() => {
    const off = ipc.onRunEvent((ev: RunEvent) => {
      if (runId && ev.id && ev.id !== runId) return;
      if (ev.event === "progress") {
        setProgress({ done: ev.done, total: ev.total, note: ev.note ?? "" });
      } else if (ev.event === "log") {
        setLogs(prev => [...prev, { t: ev.t, lvl: ev.lvl, msg: ev.msg }]);
      } else if (ev.event === "done") {
        setResult({ ok: ev.ok, durationMs: ev.duration_ms, outputs: ev.outputs, warnings: ev.warnings });
        setProgress(p => ({ ...p, done: p.total }));
      }
    });
    return () => { off.then(fn => fn()); };
  }, [runId]);

  if (!task) return <div className="p-9 text-ink-50">未找到任务: {taskId}</div>;

  const auto: Phase =
    result    ? "done"
    : runId   ? "running"
    : inputPath ? "configure"
    : "input";
  const phase = override ?? auto;

  const reachable: Record<Phase, boolean> = {
    input:     true,
    configure: !!inputPath,
    running:   !!runId,
    done:      !!result
  };

  async function pickFile() {
    const p = await ipc.pickFile(task!.inputs);
    if (p) { setInputPath(p); setOverride(null); }
  }
  async function pickFolder() {
    const p = await ipc.pickFolder();
    if (p) setOutputDir(p);
  }
  async function startRun() {
    if (!inputPath) return;
    setLogs([]); setResult(null);
    runStartRef.current = Date.now();
    const id = await ipc.startRun({
      taskId: task!.id, input: inputPath, outputDir, options: {}
    });
    setRunId(id); setOverride(null);
  }
  function cancel() { if (runId) ipc.cancelRun(runId); }
  function reset() {
    setInputPath(null); setRunId(null); setResult(null);
    setProgress({ done: 0, total: 1, note: "" }); setLogs([]);
    setOverride("input"); runStartRef.current = null;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Header task={task} runId={runId} />

      <div className="grid min-h-0 flex-1 grid-cols-[200px_1fr] overflow-hidden">
        <StepRail
          phase={phase}
          reachable={reachable}
          onNav={(p) => { if (reachable[p]) setOverride(p); }}
        />
        <div className="min-w-0 overflow-auto px-9 pb-7 pt-5">
          {phase === "input" && (
            <InputStep
              task={task}
              path={inputPath}
              onPick={pickFile}
              onNext={() => setOverride("configure")}
            />
          )}
          {phase === "configure" && inputPath && (
            <ConfigureStep
              task={task}
              input={inputPath}
              outputDir={outputDir}
              onPickFolder={pickFolder}
              onBack={() => setOverride("input")}
              onStart={startRun}
            />
          )}
          {phase === "running" && (
            <RunningStep progress={progress} logs={logs} onCancel={cancel} />
          )}
          {phase === "done" && result && (
            <DoneStep result={result} onReset={reset} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── header ───────────────────────────

function Header({ task, runId }: { task: TaskDescriptor; runId: string | null }) {
  return (
    <header className="border-b border-rule-soft px-9 pb-4 pt-5">
      <div className="flex items-center gap-2 text-[11px] text-ink-50">
        <span>处理任务</span>
        <span className="text-ink-30">/</span>
        <span className="font-mono">{task.code}</span>
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-6">
        <div className="min-w-0">
          <h1 className="m-0 text-[20px] font-semibold tracking-[-0.01em]">{task.name}</h1>
          <p className="mt-1 max-w-[720px] text-[12.5px] leading-[1.55] text-ink-50">{task.desc}</p>
        </div>
        {runId && (
          <div className="whitespace-nowrap font-mono text-[11px] text-ink-50">
            run · {runId.slice(-6)}
          </div>
        )}
      </div>
    </header>
  );
}

// ─────────────────────────── step rail ───────────────────────────

function StepRail({
  phase, reachable, onNav
}: {
  phase: Phase;
  reachable: Record<Phase, boolean>;
  onNav: (p: Phase) => void;
}) {
  const idx = STEPS.findIndex(s => s.id === phase);
  return (
    <aside className="flex flex-col gap-1 border-r border-rule bg-panel px-3.5 py-6">
      {STEPS.map((s, i) => {
        const state: "done" | "current" | "upcoming" =
          i < idx ? "done" : i === idx ? "current" : "upcoming";
        const can = reachable[s.id];
        return (
          <button
            key={s.id}
            disabled={!can}
            onClick={() => onNav(s.id)}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left",
              can ? "hover:bg-black/[0.03]" : "cursor-not-allowed opacity-50"
            )}
          >
            <StepGlyph state={state} index={i + 1} />
            <span
              className={cn(
                "text-[12.5px]",
                state === "current" ? "font-semibold text-ink"
                  : state === "done" ? "text-ink-70"
                  : "text-ink-50"
              )}
            >
              {s.label}
            </span>
          </button>
        );
      })}
    </aside>
  );
}

function StepGlyph({
  state, index
}: { state: "done" | "current" | "upcoming"; index: number }) {
  if (state === "done") {
    return (
      <div className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-accent text-white">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 5.4l2 2 4-4.5"
            stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }
  if (state === "current") {
    return (
      <div className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full border-[1.5px] border-accent bg-card font-mono text-[10px] font-semibold text-accent">
        {index}
      </div>
    );
  }
  return (
    <div className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full border border-dashed border-ink-10 bg-card font-mono text-[10px] text-ink-30">
      {index}
    </div>
  );
}

// ─────────────────────────── step 1 · input ───────────────────────────

function InputStep({
  task, path, onPick, onNext
}: {
  task: TaskDescriptor;
  path: string | null;
  onPick: () => void;
  onNext: () => void;
}) {
  return (
    <div>
      <SectionLabel>选择输入</SectionLabel>

      <div className="mt-2.5 flex items-center gap-4 rounded-lg border border-dashed border-ink-10 bg-card px-6 py-6">
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-md bg-accent-soft text-accent">
          <UploadIcon />
        </div>
        <div className="flex-1">
          <div className="text-[14px] font-semibold text-ink">拖放文件到此处</div>
          <div className="mt-1 text-[12px] text-ink-50">
            支持 {task.inputs.map(s => "." + s).join(" / ")}
          </div>
        </div>
        <Button variant="secondary" onClick={onPick}>选择文件</Button>
      </div>

      {path && (
        <Card className="mt-3 overflow-hidden">
          <CardHeader>已选择 1 个文件</CardHeader>
          <div className="flex items-center gap-3 px-4 py-3">
            <FileChip ext={extOf(path)} />
            <div className="min-w-0 flex-1 truncate text-[13px] font-medium">{path}</div>
            <Badge tone="ok">就绪</Badge>
          </div>
        </Card>
      )}

      <div className="mt-4 flex justify-end">
        <Button disabled={!path} onClick={onNext}>下一步</Button>
      </div>
    </div>
  );
}

// ─────────────────────────── step 2 · configure ───────────────────────────

function ConfigureStep({
  task, input, outputDir, onPickFolder, onBack, onStart
}: {
  task: TaskDescriptor;
  input: string;
  outputDir: string;
  onPickFolder: () => void;
  onBack: () => void;
  onStart: () => void;
}) {
  return (
    <div>
      <SectionLabel>处理选项</SectionLabel>

      <Card className="mt-2.5 px-5 py-4">
        <Field label="输入文件" value={input} mono />
        <Field
          label="输出文件夹"
          value={outputDir}
          mono
          action={<PickerButton variant="path" onClick={onPickFolder} />}
        />
        <div className="mt-3 border-t border-rule-soft pt-3 text-[11.5px] text-ink-50">
          <span className="font-mono">{task.code}</span> 暂无额外选项 — 使用默认处理流程
        </div>
      </Card>

      <div className="mt-4 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>上一步</Button>
        <Button onClick={onStart}>开始处理</Button>
      </div>
    </div>
  );
}

// ─────────────────────────── step 3 · running ───────────────────────────

function RunningStep({
  progress, logs, onCancel
}: {
  progress: { done: number; total: number; note: string };
  logs: LogLine[];
  onCancel: () => void;
}) {
  const pct = (progress.done / Math.max(1, progress.total)) * 100;
  return (
    <div>
      <SectionLabel>正在处理</SectionLabel>

      <Card className="mt-2.5 px-5 py-4">
        <div className="flex items-baseline justify-between">
          <div className="text-[13px] font-semibold">处理中</div>
          <div className="font-mono text-[12px] text-ink-50">
            <span className="font-semibold text-ink">{progress.done} / {progress.total}</span>
          </div>
        </div>
        <Progress value={pct} className="mt-2.5" />
        <div className="mt-2 truncate font-mono text-[11px] text-ink-50">
          {progress.note || "—"}
        </div>
      </Card>

      <Card className="mt-3.5 overflow-hidden">
        <CardHeader>处理日志</CardHeader>
        <div className="max-h-[320px] overflow-auto px-4 py-2.5 font-mono text-[11.5px] leading-7">
          {logs.length === 0
            ? <div className="text-ink-30">等待日志输出 …</div>
            : logs.map((l, i) => <LogRow key={i} line={l} />)}
        </div>
      </Card>

      <div className="mt-4 flex justify-end">
        <Button variant="ghost" onClick={onCancel}>取消处理</Button>
      </div>
    </div>
  );
}

// ─────────────────────────── step 4 · done ───────────────────────────

function DoneStep({
  result, onReset
}: { result: RunResult; onReset: () => void }) {
  return (
    <div>
      <SectionLabel>处理完成</SectionLabel>

      <Card className="mt-2.5 flex items-center gap-[18px] px-6 py-5">
        <div
          className={cn(
            "flex h-11 w-11 flex-none items-center justify-center rounded-full",
            result.ok ? "bg-accent-soft text-accent" : "bg-err/10 text-err"
          )}
        >
          {result.ok ? <CheckIcon /> : <XIcon />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-semibold">
            {result.ok ? "处理完成" : "处理失败"}
          </div>
          <div className="mt-0.5 text-[12.5px] text-ink-50">
            输出 <span className="font-mono font-semibold text-ink">{result.outputs.length}</span> 个文件
            <span className="mx-2 text-ink-30">·</span>
            用时 <span className="font-mono font-semibold text-ink">{formatMs(result.durationMs)}</span>
            {result.warnings.length > 0 && (
              <>
                <span className="mx-2 text-ink-30">·</span>
                <span className="text-warn">{result.warnings.length} 条警告</span>
              </>
            )}
          </div>
        </div>
        <Button variant="secondary">打开输出文件夹</Button>
        <Button onClick={onReset}>再来一次</Button>
      </Card>

      {result.outputs.length > 0 && (
        <>
          <div className="mt-6"><SectionLabel>输出文件</SectionLabel></div>
          <Card className="mt-2.5 overflow-hidden">
            {result.outputs.map((p, i) => (
              <div
                key={p}
                className={cn(
                  "grid grid-cols-[32px_1fr_140px] items-center gap-3 px-4 py-2.5 text-[12.5px]",
                  i < result.outputs.length - 1 && "border-b border-rule-soft"
                )}
              >
                <FileChip ext={extOf(p)} />
                <div className="truncate">{p}</div>
                <div className="text-right">
                  <button className="text-[11px] text-accent hover:underline">打开</button>
                  <span className="mx-1.5 text-ink-30">·</span>
                  <button className="text-[11px] text-ink-50 hover:text-ink">显示位置</button>
                </div>
              </div>
            ))}
          </Card>
        </>
      )}

      {result.warnings.length > 0 && (
        <>
          <div className="mt-6"><SectionLabel>{result.warnings.length} 条警告</SectionLabel></div>
          <Card className="mt-2.5 border-warn/30 bg-warn-soft px-4 py-3 font-mono text-[11.5px] leading-7 text-warn">
            {result.warnings.map((w, i) => <div key={i}>warn · {w}</div>)}
          </Card>
        </>
      )}
    </div>
  );
}

// ─────────────────────────── shared ───────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-50">
      {children}
    </div>
  );
}

function Field({
  label, value, mono, action
}: { label: string; value: string; mono?: boolean; action?: React.ReactNode }) {
  return (
    <div className="border-b border-rule-soft py-2 last:border-b-0">
      <div className="text-[11px] text-ink-50">{label}</div>
      <div className="mt-1 flex items-center justify-between gap-3">
        <div className={cn("min-w-0 flex-1 truncate text-[12.5px] text-ink", mono && "font-mono text-[12px]")}>
          {value}
        </div>
        {action}
      </div>
    </div>
  );
}

function FileChip({ ext }: { ext: string }) {
  return (
    <div className="flex h-[26px] w-[22px] flex-none items-center justify-center rounded-sm border border-accent/30 bg-accent-soft font-mono text-[7.5px] font-bold tracking-wide text-accent">
      {ext.slice(0, 4)}
    </div>
  );
}

function LogRow({ line }: { line: LogLine }) {
  return (
    <div className="flex gap-3 text-ink-70">
      <span className="w-[92px] flex-none text-ink-30">{line.t}</span>
      <span
        className={cn(
          "w-9 flex-none",
          line.lvl === "warn" ? "text-warn"
            : line.lvl === "ok"  ? "text-accent"
            : line.lvl === "err" ? "text-err"
            : "text-ink-50"
        )}
      >
        {line.lvl}
      </span>
      <span className={line.lvl === "ok" ? "text-ink" : undefined}>{line.msg}</span>
    </div>
  );
}

function extOf(path: string): string {
  return (path.split(".").pop() ?? "FILE").toUpperCase();
}

// ─────────────────────────── icons ───────────────────────────

function UploadIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
        stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M5 11.5l4 4 8.5-9"
        stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M5 5l10 10M15 5L5 15"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
