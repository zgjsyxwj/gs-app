import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import {
  FX_NAME,
  FX_PAIRS,
  FX_QUICK_PAIRS,
  FX_SYMBOL,
  fxFormat,
  fxParse,
  type FxPair,
} from "@/lib/fx";
import { fetchHistory, type DailyRates } from "@/lib/fx-api";

const DEFAULT_PAIR_CODE = "USD/VND";
const DEFAULT_AMOUNT = 12480;
const FETCH_BASE = "usd"; // covers all 5 quick pairs (AUD/USD and EUR/USD via reciprocal)
const HISTORY_DAYS = 8;

type Status = "loading" | "ok" | "error";

/**
 * Derive an FxPair for a `{base}/{quote}` code from an oldest-first history
 * of `FETCH_BASE` rates. Supports three cases:
 *   - base === FETCH_BASE:    direct lookup of `rates[quote]`
 *   - quote === FETCH_BASE:   reciprocal of `rates[base]`
 *   - cross-pair (neither):   `rates[quote] / rates[base]`
 */
function pairFromHistory(code: string, history: DailyRates[]): FxPair | null {
  const [base, quote] = code.split("/");
  if (!base || !quote) return null;

  const baseLower = base.toLowerCase();
  const quoteLower = quote.toLowerCase();
  const series: number[] = [];

  for (const day of history) {
    let r: number | null = null;
    if (baseLower === FETCH_BASE) {
      const v = day.rates[quoteLower];
      if (typeof v === "number" && v > 0) r = v;
    } else if (quoteLower === FETCH_BASE) {
      const v = day.rates[baseLower];
      if (typeof v === "number" && v > 0) r = 1 / v;
    } else {
      const a = day.rates[baseLower];
      const b = day.rates[quoteLower];
      if (typeof a === "number" && a > 0 && typeof b === "number" && b > 0) {
        r = b / a;
      }
    }
    if (r !== null) series.push(r);
  }
  if (series.length === 0) return null;

  const rate = series[series.length - 1];
  const prev = series.length >= 2 ? series[series.length - 2] : rate;
  const change = prev === 0 ? 0 : ((rate - prev) / prev) * 100;

  const fallback = FX_PAIRS.find((p) => p.code === code);
  return {
    code,
    base: base.toUpperCase(),
    quote: quote.toUpperCase(),
    rate,
    change,
    spark: series,
    note: fallback?.note ?? "—",
  };
}

function relativeTimeZh(ms: number): string {
  if (ms < 60_000) return "刚刚";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

export function FxPanel() {
  const [activeCode, setActiveCode] = useState(DEFAULT_PAIR_CODE);
  const [fromAmount, setFromAmount] = useState(DEFAULT_AMOUNT);
  const [history, setHistory] = useState<DailyRates[] | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    fetchHistory(FETCH_BASE, HISTORY_DAYS)
      .then((h) => {
        if (!alive) return;
        if (h.length === 0) {
          setStatus("error");
          return;
        }
        setHistory(h);
        setUpdatedAt(new Date());
        setStatus("ok");
      })
      .catch((err) => {
        console.error("[fx] fetch failed", err);
        if (alive) setStatus("error");
      });
    return () => {
      alive = false;
    };
  }, []);

  // keep the relative-time label fresh without re-fetching
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const pair = useMemo<FxPair>(() => {
    if (history) {
      const live = pairFromHistory(activeCode, history);
      if (live) return live;
    }
    return FX_PAIRS.find((p) => p.code === activeCode) ?? FX_PAIRS[0];
  }, [activeCode, history]);

  const toAmount = fromAmount * pair.rate;

  const swapPair = () => setActiveCode(`${pair.quote}/${pair.base}`);

  const statusLabel =
    status === "loading"
      ? "正在更新…"
      : status === "error"
        ? "离线数据 · 更新失败"
        : updatedAt
          ? `mid-market · ${relativeTimeZh(now - updatedAt.getTime())}更新`
          : "mid-market";

  return (
    <section>
      <SectionLabel
        right={<span className="font-mono text-[10px] text-ink-50">{statusLabel}</span>}
      >
        汇率换算
      </SectionLabel>

      <Card className="mb-[22px] rounded-lg">
        <div className="px-5 py-[18px]">
          <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2.5">
            <FxAmountField
              label="从"
              code={pair.base}
              value={fromAmount}
              onChange={setFromAmount}
              onCodeChange={(next) => {
                if (next === pair.base) return;
                if (next === pair.quote) swapPair();
                else setActiveCode(`${next}/${pair.quote}`);
              }}
              mode="input"
            />
            <div className="flex items-center justify-center">
              <button
                type="button"
                aria-label="互换货币"
                onClick={swapPair}
                className="flex h-[30px] w-[30px] items-center justify-center rounded-md border border-rule bg-card text-ink-70 transition-colors hover:bg-black/[0.03]"
              >
                <SwapIcon />
              </button>
            </div>
            <FxAmountField
              label="到"
              code={pair.quote}
              value={toAmount}
              onCodeChange={(next) => {
                if (next === pair.quote) return;
                if (next === pair.base) swapPair();
                else setActiveCode(`${pair.base}/${next}`);
              }}
              mode="output"
            />
          </div>

          {/* rate line + chart */}
          <div className="mt-3.5 flex items-center gap-3.5 rounded border border-rule-soft bg-panel-soft px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[12px] font-semibold text-ink">
                1 {pair.base} = {fxFormat(pair.rate, pair.quote)} {pair.quote}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-ink-50">
                <FxChangePill change={pair.change} />
                <span>过去 7 天</span>
              </div>
            </div>
            <FxSpark data={pair.spark} up={pair.change >= 0} width={160} height={36} />
          </div>

          {/* quick pairs */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 self-center text-[10.5px] text-ink-50">常用：</span>
            {FX_QUICK_PAIRS.map((code) => {
              const active = code === pair.code;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setActiveCode(code)}
                  className={cn(
                    "rounded-sm border px-2 py-0.5 font-mono text-[10.5px] font-medium",
                    active
                      ? "border-accent/30 bg-accent-soft text-accent"
                      : "border-ink-10 bg-card text-ink-70 hover:bg-black/[0.03]"
                  )}
                >
                  {code}
                </button>
              );
            })}
          </div>
        </div>
      </Card>
    </section>
  );
}

function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-50">
        {children}
      </div>
      {right}
    </div>
  );
}

function FxAmountField({
  label,
  code,
  value,
  onChange,
  onCodeChange,
  mode,
}: {
  label: string;
  code: string;
  value: number;
  onChange?: (n: number) => void;
  onCodeChange?: (next: string) => void;
  mode: "input" | "output";
}) {
  const isInput = mode === "input";
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const display = editing ? draft : fxFormat(value, code);

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-md border px-3 py-2.5",
        isInput
          ? "border-ink-10 bg-card shadow-[0_0_0_3px_hsl(var(--accent)/0.08)]"
          : "border-rule bg-panel-soft"
      )}
    >
      <div className="flex items-center justify-between text-[10.5px] text-ink-50">
        <span>{label}</span>
        <div ref={pickerRef} className="relative">
          <button
            type="button"
            onClick={() => onCodeChange && setOpen((v) => !v)}
            className="flex items-center gap-1.5 border-none bg-transparent p-0 text-ink"
          >
            <FxChip code={code} size={18} />
            <span className="text-[12px] font-semibold">{code}</span>
            <ChevronIcon />
          </button>
          {open && onCodeChange && (
            <div className="absolute right-0 top-full z-10 mt-1 flex min-w-[200px] flex-col rounded-md border border-rule bg-card py-1 shadow-pop">
              {Object.keys(FX_SYMBOL).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    onCodeChange(c);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex items-center gap-2 px-2.5 py-1.5 text-left text-[12px] hover:bg-black/[0.03]",
                    c === code && "bg-accent-soft"
                  )}
                >
                  <FxChip code={c} size={18} />
                  <span className="font-mono font-semibold text-ink">{c}</span>
                  {FX_NAME[c] && (
                    <span className="ml-auto pl-3 text-[10.5px] text-ink-50">{FX_NAME[c]}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {isInput && onChange ? (
        <input
          type="text"
          inputMode="decimal"
          value={display}
          onFocus={() => {
            setEditing(true);
            setDraft(value === 0 ? "" : String(value));
          }}
          onChange={(e) => {
            setDraft(e.target.value);
            onChange(fxParse(e.target.value));
          }}
          onBlur={() => setEditing(false)}
          className="w-full overflow-hidden text-ellipsis whitespace-nowrap bg-transparent font-mono text-[24px] font-semibold tracking-[-0.02em] text-ink outline-none"
        />
      ) : (
        <div className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[24px] font-semibold tracking-[-0.02em] text-ink">
          {display}
        </div>
      )}
    </div>
  );
}

export function FxChip({ code, size = 22 }: { code: string; size?: number }) {
  const sym = FX_SYMBOL[code] ?? code.slice(0, 2);
  const key = code.toLowerCase();
  const known = code in FX_SYMBOL;
  return (
    <div
      className="flex flex-none items-center justify-center rounded-sm border border-black/5 font-mono font-semibold tracking-[-0.02em]"
      style={{
        width: size,
        height: size,
        fontSize: size >= 24 ? 11 : 9.5,
        background: known ? `hsl(var(--fx-${key}-bg))` : "hsl(var(--panel))",
        color: known ? `hsl(var(--fx-${key}-fg))` : "hsl(var(--ink-70))",
      }}
    >
      {sym}
    </div>
  );
}

function FxChangePill({ change }: { change: number }) {
  const up = change >= 0;
  return (
    <span
      className={cn(
        "whitespace-nowrap rounded-sm px-1.5 py-0.5 font-mono text-[10.5px] font-semibold",
        up ? "bg-accent/10 text-accent" : "bg-err/10 text-err"
      )}
    >
      {up ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
    </span>
  );
}

function FxSpark({
  data,
  width = 64,
  height = 18,
  up,
}: {
  data: number[];
  width?: number;
  height?: number;
  up: boolean;
}) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * (width - 2) + 1;
      const y = height - 1 - ((v - min) / range) * (height - 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} className="block">
      <polyline
        points={pts}
        fill="none"
        stroke={up ? "hsl(var(--accent))" : "hsl(var(--err))"}
        strokeWidth={1.25}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SwapIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M3.5 4.5h8m0 0L8.5 1.5m3 3l-3 3M10.5 9.5h-8m0 0l3 3m-3-3l3-3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path
        d="M2 3.5l3 3 3-3"
        stroke="hsl(var(--ink-50))"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
