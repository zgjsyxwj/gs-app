import { useEffect, useMemo, useRef, useState } from "react";
import { ipc, type RunEvent } from "@/lib/ipc";
import { cn, formatBytes, formatMs } from "@/lib/utils";

type Tone = "amber" | "teal" | "plum";
type Status = "idle" | "running" | "done" | "err";

type Period = { display: string; dashed: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const DEFAULT_PASSWORD = "vnpayroll";

function currentPeriod(): Period {
  const d = new Date();
  return {
    display: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
    dashed: `${MONTHS[d.getMonth()]}-${d.getFullYear()}`,
  };
}

type Slot = { label: string };

type StationDef = {
  n: number;
  tone: Tone;
  code: string;
  title: string;
  desc: string;
  slots: Slot[];
};

const STATIONS: StationDef[] = [
  {
    n: 1,
    tone: "amber",
    code: "GL",
    title: "GL 报告",
    desc: "按 G/L Acc 起始位填入 BusinessArea / ProfitCenter / CostCenter",
    slots: [{ label: "GL 报告" }],
  },
  {
    n: 2,
    tone: "teal",
    code: "13th",
    title: "13th 报告",
    desc: "按 G/L Code 起始位填入 BusinessArea / ProfitCenter / CostCenter",
    slots: [{ label: "13th 报告" }],
  },
  {
    n: 3,
    tone: "plum",
    code: "Variance",
    title: "Variance 报告",
    desc: "按 GID 关联 Payroll · 向 Variance 追加 Start date / Last working date",
    slots: [{ label: "Payroll 报告" }, { label: "Variance 报告" }],
  },
];

type StationState = {
  files: (string | null)[];
  status: Status;
  runId: string | null;
  output: string | null;
  outputBytes: number | null;
  durationMs: number | null;
  errMsg: string | null;
};

const baseName = (p: string) => p.split(/[/\\]/).pop() ?? p;

// Directory portion of an absolute path, trailing separator stripped.
const parentDir = (p: string) => {
  const norm = p.replace(/[/\\]+$/, "");
  const idx = Math.max(norm.lastIndexOf("/"), norm.lastIndexOf("\\"));
  return idx >= 0 ? norm.slice(0, idx) : "";
};

// True when any picked input file lives directly in `outDir`. GL/13th write the
// result back under the input's own filename, so an in-place output dir would
// shadow the source file — block the run and make the user pick a different dir.
function inputCollidesWithOutDir(files: (string | null)[], outDir: string | null): boolean {
  if (!outDir) return false;
  const target = outDir.replace(/[/\\]+$/, "");
  return files.some((f) => f != null && parentDir(f) === target);
}

function shortenHome(path: string, home: string | null): string {
  if (home && path === home) return "~";
  if (home && path.startsWith(home + "/")) return "~" + path.slice(home.length);
  return path;
}

export default function VnPayrollReport() {
  const period = useMemo(currentPeriod, []);

  // Resolved home dir is only used to collapse picked paths to "~/…" for display.
  const [home, setHome] = useState<string | null>(null);
  useEffect(() => {
    ipc
      .systemUsername()
      .then((u) => setHome(`/Users/${u}`))
      .catch(() => setHome(null));
  }, []);

  const [outDir, setOutDir] = useState<string | null>(null);
  const effectiveOutDir = outDir;

  const [password, setPassword] = useState<string>(DEFAULT_PASSWORD);
  const [showPwd, setShowPwd] = useState(false);

  const [stations, setStations] = useState<StationState[]>(() =>
    STATIONS.map((s) => ({
      files: s.slots.map(() => null),
      status: "idle",
      runId: null,
      output: null,
      outputBytes: null,
      durationMs: null,
      errMsg: null,
    }))
  );

  // Subscribe once, fan events out to the station that owns the runId.
  const stationsRef = useRef(stations);
  stationsRef.current = stations;

  // runId → station index, updated synchronously the moment startRun resolves.
  // Avoids a race where a fast sidecar (e.g. 78ms) emits "done" before React
  // has flushed the setStations({runId}) update, which would drop the event.
  const runIdToIdx = useRef<Map<string, number>>(new Map());
  // Events that arrived before the station registered their runId. Replayed
  // on registration and otherwise garbage-collected on cleanup.
  const pendingEvents = useRef<Map<string, RunEvent[]>>(new Map());

  function applyEvent(ev: RunEvent, idx: number) {
    if (ev.event === "log" && ev.lvl === "err") {
      setStations((curr) => {
        const next = [...curr];
        next[idx] = { ...next[idx], errMsg: ev.msg };
        return next;
      });
      return;
    }
    if (ev.event !== "done") return;

    const outs = ev.outputs ?? [];
    const code = STATIONS[idx].code.toLowerCase();
    const myOut = outs.find((p) => baseName(p).toLowerCase().includes(code)) ?? outs[0] ?? null;

    setStations((curr) => {
      const next = [...curr];
      next[idx] = {
        ...next[idx],
        status: ev.ok ? "done" : "err",
        durationMs: ev.duration_ms,
        output: myOut,
        errMsg: ev.ok ? null : (next[idx].errMsg ?? "处理失败"),
      };
      return next;
    });

    if (myOut) {
      ipc
        .fileSize(myOut)
        .then((b) => {
          setStations((curr) => {
            const next = [...curr];
            next[idx] = { ...next[idx], outputBytes: b };
            return next;
          });
        })
        .catch(() => {});
    }
  }

  useEffect(() => {
    let off: (() => void) | undefined;
    let cancelled = false;
    ipc
      .onRunEvent((ev: RunEvent) => {
        if (cancelled) return;
        const idx = runIdToIdx.current.get(ev.id);
        if (idx === undefined) {
          const buf = pendingEvents.current.get(ev.id) ?? [];
          buf.push(ev);
          pendingEvents.current.set(ev.id, buf);
          return;
        }
        applyEvent(ev, idx);
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

  async function pickOutDir() {
    const d = await ipc.pickFolder();
    if (d) setOutDir(d);
  }

  async function pickStationFile(stationIdx: number, slotIdx: number) {
    const p = await ipc.pickFile(["xlsx"]);
    if (!p) return;
    setStations((curr) => {
      const next = [...curr];
      const files = [...next[stationIdx].files];
      files[slotIdx] = p;
      next[stationIdx] = { ...next[stationIdx], files };
      return next;
    });
  }

  async function startStation(idx: number) {
    const station = STATIONS[idx];
    const state = stationsRef.current[idx];
    if (!effectiveOutDir) return;
    if (state.files.some((f) => f == null)) return;
    if (state.status === "running") return;
    if (inputCollidesWithOutDir(state.files, effectiveOutDir)) return;

    setStations((curr) => {
      const next = [...curr];
      next[idx] = {
        ...next[idx],
        status: "running",
        runId: null,
        errMsg: null,
        output: null,
        outputBytes: null,
        durationMs: null,
      };
      return next;
    });

    try {
      const extras: Record<string, string> = {};
      state.files.slice(1).forEach((f, i) => {
        if (f) extras[`input${i + 2}`] = f;
      });
      const id = await ipc.startRun({
        taskId: "va-vn-payroll-report",
        input: state.files[0]!,
        outputDir: effectiveOutDir,
        options: {
          period: period.display,
          station: station.code,
          password,
          ...extras,
        },
      });
      // Register synchronously before React re-renders so events that arrived
      // during the await (fast sidecar runs are ~80ms) get routed correctly.
      runIdToIdx.current.set(id, idx);
      setStations((curr) => {
        const next = [...curr];
        next[idx] = { ...next[idx], runId: id };
        return next;
      });
      const buffered = pendingEvents.current.get(id);
      if (buffered) {
        pendingEvents.current.delete(id);
        for (const ev of buffered) applyEvent(ev, idx);
      }
    } catch (e) {
      setStations((curr) => {
        const next = [...curr];
        next[idx] = { ...next[idx], status: "err", errMsg: `启动失败：${e}` };
        return next;
      });
    }
  }

  async function processAll() {
    for (let i = 0; i < STATIONS.length; i++) {
      const s = stationsRef.current[i];
      if (s.status !== "idle" && s.status !== "err") continue;
      if (s.files.some((f) => f == null)) continue;
      if (inputCollidesWithOutDir(s.files, effectiveOutDir)) continue;
      await startStation(i);
    }
  }

  async function openFile(path: string) {
    try {
      await ipc.openPath(path);
    } catch {
      /* surfaced by error toast in a richer build */
    }
  }
  async function revealFile(path: string) {
    try {
      await ipc.revealInFolder(path);
    } catch {
      /* same */
    }
  }

  const pendingCount = stations.filter((s) => s.status !== "done").length;
  const readyToRunCount = stations.filter(
    (s) =>
      (s.status === "idle" || s.status === "err") &&
      s.files.every((f) => f != null) &&
      !inputCollidesWithOutDir(s.files, effectiveOutDir)
  ).length;

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <Header pendingCount={pendingCount} totalCount={STATIONS.length} />
      <DirBar
        path={effectiveOutDir}
        display={effectiveOutDir ? shortenHome(effectiveOutDir, home) : null}
        onChange={pickOutDir}
        onProcessAll={processAll}
        readyCount={readyToRunCount}
        password={password}
        showPwd={showPwd}
        onChangePassword={setPassword}
        onToggleShowPwd={() => setShowPwd((v) => !v)}
      />
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-4 overflow-auto px-7 pb-7 pt-[22px]">
        {STATIONS.map((def, i) => (
          <StationCard
            key={def.n}
            def={def}
            state={stations[i]}
            outDirReady={!!effectiveOutDir}
            conflict={inputCollidesWithOutDir(stations[i].files, effectiveOutDir)}
            onPickFile={(slotIdx) => pickStationFile(i, slotIdx)}
            onStart={() => startStation(i)}
            onOpenFile={openFile}
            onRevealFile={revealFile}
          />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────── header ───────────────────────────

function Header({ pendingCount, totalCount }: { pendingCount: number; totalCount: number }) {
  const allDone = pendingCount === 0;
  return (
    <div className="flex items-end justify-between gap-4 border-b border-rule-soft px-7 pb-3.5 pt-[18px]">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[11px] text-ink-50">
          <span>处理任务</span>
          <span className="text-ink-30">/</span>
          <span className="font-mono">VA-VN-PAYROLL-REPORT</span>
        </div>
        <h1 className="mt-1.5 text-[20px] font-semibold tracking-[-0.005em] text-ink">
          瓦里安越南 · Payroll 报告加工
        </h1>
      </div>
      {allDone ? (
        <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-accent-soft py-[6px] pl-2 pr-3 font-mono text-[11.5px] font-semibold text-accent">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-white">
            <CheckIcon size={9} />
          </span>
          {totalCount} 个全部完成
        </span>
      ) : (
        <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-rule bg-card py-[6px] pl-2.5 pr-3 text-[11.5px] font-medium text-ink-70">
          <span className="h-[6px] w-[6px] rounded-full bg-ink-30" />
          {pendingCount} 个待处理
        </span>
      )}
    </div>
  );
}

// ─────────────────────────── dir bar ───────────────────────────

function DirBar({
  path,
  display,
  onChange,
  onProcessAll,
  readyCount,
  password,
  showPwd,
  onChangePassword,
  onToggleShowPwd,
}: {
  path: string | null;
  display: string | null;
  onChange: () => void;
  onProcessAll: () => void;
  readyCount: number;
  password: string;
  showPwd: boolean;
  onChangePassword: (v: string) => void;
  onToggleShowPwd: () => void;
}) {
  const text = display
    ? display.endsWith("/")
      ? display
      : display + "/"
    : path
      ? path + "/"
      : "选择输出目录…";
  return (
    <div className="flex items-center gap-3 border-b border-rule-soft bg-panel px-7 py-2.5">
      <FolderIconSmall />
      <span className="flex-none text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-50">
        输出目录
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-mono text-[12.5px]",
          path ? "text-ink" : "text-ink-30"
        )}
      >
        {text}
      </span>
      {path ? (
        <button
          type="button"
          onClick={onChange}
          className="rounded px-1 py-1.5 text-[11.5px] font-medium leading-none text-ink-70 transition-colors hover:text-ink"
        >
          更改
        </button>
      ) : (
        <button
          type="button"
          onClick={onChange}
          className={cn(
            "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[5px] border border-ink-10 bg-card px-[10px] py-[6px]",
            "text-[11.5px] font-medium leading-none text-accent transition-colors hover:border-accent hover:bg-accent-soft"
          )}
        >
          <FolderIcon />
          选择目录
        </button>
      )}

      <div className="h-6 w-px flex-none bg-rule" />

      <span className="flex-none text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-50">
        加密密码
      </span>
      <div className="flex h-[30px] flex-none items-center gap-1 rounded-md border border-ink-10 bg-card pl-2.5 pr-1">
        <input
          type={showPwd ? "text" : "password"}
          value={password}
          placeholder="设置一个密码"
          onChange={(e) => onChangePassword(e.target.value)}
          className={cn(
            "w-[160px] border-none bg-transparent font-mono text-[12.5px] text-ink",
            "outline-none placeholder:text-ink-30",
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
      </div>

      <ProcessAllButton
        onClick={onProcessAll}
        count={readyCount}
        disabled={readyCount === 0 || !path}
      />
    </div>
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

function ProcessAllButton({
  onClick,
  count,
  disabled,
}: {
  onClick: () => void;
  count: number;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-2 whitespace-nowrap rounded-[5px] bg-accent py-[6px] pl-[10px] pr-1.5",
        "text-[11.5px] font-semibold leading-none text-white shadow-pop transition-colors hover:bg-accent/90",
        "disabled:cursor-not-allowed disabled:opacity-50"
      )}
    >
      <PlayIcon />
      <span>一键处理全部</span>
      <span className="ml-0.5 rounded-[3px] bg-white/20 px-[6px] py-[3px] font-mono text-[10.5px] leading-none">
        {count}
      </span>
    </button>
  );
}

// ─────────────────────────── station card ───────────────────────────

function StationCard({
  def,
  state,
  outDirReady,
  conflict,
  onPickFile,
  onStart,
  onOpenFile,
  onRevealFile,
}: {
  def: StationDef;
  state: StationState;
  outDirReady: boolean;
  conflict: boolean;
  onPickFile: (slotIdx: number) => void;
  onStart: () => void;
  onOpenFile: (p: string) => void;
  onRevealFile: (p: string) => void;
}) {
  const tone = def.tone;
  const allFilesPicked = state.files.every((f) => f != null);
  const isRunning = state.status === "running";
  const isDone = state.status === "done";
  const isErr = state.status === "err";
  const canStart = allFilesPicked && outDirReady && !conflict && !isRunning;
  // Same-dir conflict only matters before/after a failed run — suppress it while
  // running or once a result already exists.
  const showConflict = conflict && !isDone && !isRunning;

  // Output file mirrors the "target" input — last slot for multi-input
  // stations (Variance is augmented from Payroll), the only slot otherwise.
  // The sidecar writes it back under this same name; the same-folder case is
  // blocked outright (inputCollidesWithOutDir) so it never shadows the source.
  const targetFile = state.files[state.files.length - 1];

  const projectedOutput =
    isDone && state.output ? baseName(state.output) : targetFile ? baseName(targetFile) : null;

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-rule bg-card">
      {/* tone-tinted header band */}
      <div
        className="flex items-start gap-3 border-b px-[18px] py-4"
        style={{
          background: `hsl(var(--tone-${tone}-soft))`,
          borderColor: `hsl(var(--tone-${tone}-border))`,
        }}
      >
        <NumberTile n={def.n} tone={tone} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="text-[16px] font-semibold leading-tight tracking-[-0.005em] text-ink">
              {def.title}
            </div>
            {isRunning && <Spinner size={16} />}
            {isDone && (
              <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-accent text-white">
                <CheckIcon size={10} />
              </span>
            )}
            {isErr && (
              <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-err text-white">
                <XIcon size={8} />
              </span>
            )}
          </div>
          <div className="mt-1.5 text-[11.5px] leading-[1.55] text-ink-70">{def.desc}</div>
        </div>
      </div>

      {/* file flow */}
      <div className="flex flex-1 flex-col gap-2 px-[18px] py-4">
        {def.slots.map((slot, i) => {
          const file = state.files[i];
          return (
            <div
              key={i}
              className={cn(
                "flex min-w-0 items-center gap-2.5 rounded-md border px-2.5 py-[7px]",
                file
                  ? "border-rule-soft bg-panel-soft"
                  : "border-dashed border-ink-10 bg-transparent"
              )}
            >
              <XlsxBadge size={22} muted={!file} />
              {file ? (
                <MiddleTruncate
                  text={baseName(file)}
                  className="min-w-0 flex-1 font-mono text-[11.5px] text-ink-70"
                />
              ) : (
                <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink-30">
                  {`选择 ${slot.label} .xlsx`}
                </span>
              )}
              <SlotButton onClick={() => onPickFile(i)} disabled={isRunning}>
                {file ? "替换" : "选择"}
              </SlotButton>
            </div>
          );
        })}

        <div className="my-0.5 flex items-center gap-1.5 text-ink-30">
          <div className="h-px flex-1 bg-rule-soft" />
          <ArrowDownIcon />
          <div className="h-px flex-1 bg-rule-soft" />
        </div>

        <div
          className="flex min-w-0 items-center gap-2.5 rounded-md border px-[10px] py-[10px]"
          style={{
            background: isDone ? `hsl(var(--tone-${tone}-soft))` : "transparent",
            borderColor: isDone ? `hsl(var(--tone-${tone}-border))` : "hsl(var(--ink-10))",
            borderStyle: isDone ? "solid" : "dashed",
          }}
        >
          <XlsxBadge size={28} tone={isDone ? tone : undefined} done={isDone} muted={!isDone} />
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] leading-none text-ink-50">
              {isDone
                ? "已生成"
                : isRunning
                  ? "处理中…"
                  : showConflict
                    ? "无法处理"
                    : isErr
                      ? "处理失败"
                      : "将生成"}
            </div>
            {showConflict ? (
              <div className="mt-1 text-[11px] font-medium leading-[1.45] text-err">
                输出目录与输入文件位于同一目录，为避免覆盖原文件，请更换输出目录
              </div>
            ) : projectedOutput ? (
              <MiddleTruncate
                text={projectedOutput}
                className={cn(
                  "mt-1 font-mono text-[12px] font-medium",
                  isDone ? "text-ink" : "text-ink-70"
                )}
              />
            ) : (
              <div className="mt-1 truncate font-mono text-[12px] font-medium text-ink-30">
                {`与 ${def.slots[def.slots.length - 1].label} 同名`}
              </div>
            )}
            {isDone && state.outputBytes != null && state.durationMs != null && (
              <div className="mt-1 font-mono text-[10.5px] text-ink-50">
                {formatBytes(state.outputBytes)} · {formatMs(state.durationMs)}
              </div>
            )}
            {isErr && !showConflict && state.errMsg && (
              <div className="mt-1 truncate font-mono text-[10.5px] text-err" title={state.errMsg}>
                {state.errMsg}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* footer action */}
      <div className="px-3.5 pb-3.5 pt-1">
        {isDone ? (
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <CardPrimaryButton onClick={() => state.output && onOpenFile(state.output)}>
              <FileOpenIcon />
              打开文件
            </CardPrimaryButton>
            <CardIconButton
              title="在文件夹中显示"
              onClick={() => state.output && onRevealFile(state.output)}
            >
              <FolderIcon />
            </CardIconButton>
          </div>
        ) : isRunning ? (
          <CardPrimaryButton disabled>
            <Spinner size={12} mono /> 处理中…
          </CardPrimaryButton>
        ) : (
          <CardPrimaryButton onClick={onStart} disabled={!canStart}>
            <PlayIcon />
            开始处理
          </CardPrimaryButton>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── building blocks ───────────────────────────

// Middle-truncate a filename so the tail (extension + any " (n)" dedup marker)
// stays visible while the head ellipsizes — tail-truncation would hide exactly
// the part that distinguishes outputs. Pure CSS via flex: the head shrinks and
// clips, the tail is pinned. `title` carries the full name for hover.
function MiddleTruncate({
  text,
  tail = 14,
  className,
}: {
  text: string;
  tail?: number;
  className?: string;
}) {
  const splitAt = text.length - tail;
  if (splitAt <= 0) {
    return (
      <div className={cn("truncate", className)} title={text}>
        {text}
      </div>
    );
  }
  return (
    <div className={cn("flex min-w-0", className)} title={text}>
      <span className="min-w-0 truncate">{text.slice(0, splitAt)}</span>
      <span className="flex-none whitespace-pre">{text.slice(splitAt)}</span>
    </div>
  );
}

function NumberTile({ n, tone }: { n: number; tone: Tone }) {
  return (
    <div
      className="flex h-10 w-10 flex-none items-center justify-center rounded-lg font-mono text-[18px] font-bold tracking-[-0.02em]"
      style={{
        background: `hsl(var(--tone-${tone}-bg))`,
        color: `hsl(var(--tone-${tone}-ink))`,
        border: `1px solid hsl(var(--tone-${tone}-border))`,
      }}
    >
      {n}
    </div>
  );
}

function XlsxBadge({
  size,
  tone,
  done,
  muted,
}: {
  size: number;
  tone?: Tone;
  done?: boolean;
  muted?: boolean;
}) {
  const w = Math.round(size * 0.78);
  return (
    <div
      className="relative flex flex-none items-center justify-center rounded-sm border font-mono font-bold"
      style={{
        width: w,
        height: size,
        fontSize: Math.round(size * 0.3),
        background: tone
          ? `hsl(var(--tone-${tone}-soft))`
          : muted
            ? "transparent"
            : "hsl(var(--card))",
        borderColor: tone ? `hsl(var(--tone-${tone}-border))` : "hsl(var(--ink-10))",
        color: tone
          ? `hsl(var(--tone-${tone}-ink))`
          : muted
            ? "hsl(var(--ink-30))"
            : "hsl(var(--ink-50))",
        borderStyle: muted && !tone ? "dashed" : "solid",
      }}
    >
      X
      {done && (
        <div className="absolute -bottom-1 -right-1 flex h-[13px] w-[13px] items-center justify-center rounded-full border-[1.5px] border-white bg-accent text-white">
          <CheckIcon size={7} />
        </div>
      )}
    </div>
  );
}

function Spinner({ size, mono }: { size: number; mono?: boolean }) {
  return (
    <span
      className={cn(
        "relative inline-block rounded-full border-[1.5px]",
        mono ? "border-white/30" : "border-accent/30"
      )}
      style={{ width: size, height: size }}
    >
      <span
        className={cn(
          "absolute -inset-[1.5px] animate-spin rounded-full border-[1.5px] border-transparent",
          mono ? "border-t-white" : "border-t-accent"
        )}
      />
    </span>
  );
}

// ─────────────────────────── buttons ───────────────────────────

function SlotButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex flex-none items-center rounded-[5px] border border-ink-10 bg-card px-2 py-[5px]",
        "text-[10.5px] font-medium leading-none text-ink-70 transition-colors duration-[120ms]",
        "hover:border-accent hover:bg-accent-soft hover:text-accent",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-ink-10 disabled:hover:bg-card disabled:hover:text-ink-70"
      )}
    >
      {children}
    </button>
  );
}

function CardPrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex w-full items-center justify-center gap-1.5 rounded-md py-[9px] text-[12.5px] font-semibold leading-none transition-colors",
        disabled
          ? "cursor-not-allowed border border-ink-10 bg-card text-ink-30"
          : "bg-accent text-white shadow-pop hover:bg-accent/90"
      )}
    >
      {children}
    </button>
  );
}

function CardIconButton({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md border bg-card transition-colors",
        disabled
          ? "cursor-not-allowed border-ink-10 text-ink-30"
          : "border-ink-10 text-ink-70 hover:bg-black/[0.03]"
      )}
    >
      {children}
    </button>
  );
}

// ─────────────────────────── icons ───────────────────────────

function ArrowDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M7 2v10M3 8l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none">
      <path
        d="M2 5.4l2 2 4-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function XIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
      <path d="M3 2v10l8-5L3 2z" fill="currentColor" />
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

function FolderIconSmall() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-none text-accent">
      <path
        d="M1.8 4a1 1 0 0 1 1-1H6l1.2 1.4h4a1 1 0 0 1 1 1V11a1 1 0 0 1-1 1H2.8a1 1 0 0 1-1-1V4Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FileOpenIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
      <path
        d="M3 2.5h4.5L11 6v5.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M7.5 2.5V6H11" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}
