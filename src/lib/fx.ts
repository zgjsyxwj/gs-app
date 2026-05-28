/**
 * FX domain data + helpers — static fallback values used until the live
 * API (see `fx-api.ts`) resolves. Shape mirrors what the converter consumes.
 */

export type FxPair = {
  code: string;
  base: string;
  quote: string;
  rate: number;
  change: number;
  spark: number[];
  note: string;
};

export const FX_PAIRS: FxPair[] = [
  {
    code: "USD/TWD",
    base: "USD",
    quote: "TWD",
    rate: 32.184,
    change: -0.12,
    spark: [32.4, 32.35, 32.28, 32.3, 32.22, 32.18, 32.19, 32.184],
    note: "瓦里安 / 微创",
  },
  {
    code: "USD/VND",
    base: "USD",
    quote: "VND",
    rate: 25480,
    change: +0.34,
    spark: [25380, 25410, 25395, 25420, 25445, 25460, 25470, 25480],
    note: "瓦里安越南",
  },
  {
    code: "USD/CNY",
    base: "USD",
    quote: "CNY",
    rate: 7.182,
    change: -0.21,
    spark: [7.21, 7.2, 7.205, 7.198, 7.19, 7.185, 7.183, 7.182],
    note: "微创报销",
  },
  {
    code: "USD/AUD",
    base: "USD",
    quote: "AUD",
    rate: 1.5234,
    change: +0.18,
    spark: [1.515, 1.518, 1.52, 1.519, 1.521, 1.522, 1.524, 1.5234],
    note: "旺旺 AU",
  },
  {
    code: "USD/INR",
    base: "USD",
    quote: "INR",
    rate: 83.42,
    change: +0.05,
    spark: [83.3, 83.35, 83.38, 83.4, 83.41, 83.39, 83.42, 83.42],
    note: "神通 IN",
  },
  {
    code: "EUR/USD",
    base: "EUR",
    quote: "USD",
    rate: 1.0894,
    change: +0.27,
    spark: [1.084, 1.085, 1.086, 1.087, 1.088, 1.088, 1.089, 1.0894],
    note: "—",
  },
];

/**
 * Per-currency display symbol. Background / foreground colors live in
 * `--fx-{code}-{bg|fg}` CSS variables (globals.css) and are read via
 * inline style in FXChip — this keeps the flag palette centralized
 * without bloating tailwind.config.ts with domain data.
 */
export const FX_SYMBOL: Record<string, string> = {
  USD: "$",
  TWD: "NT",
  VND: "₫",
  CNY: "¥",
  AUD: "A$",
  INR: "₹",
  EUR: "€",
  HKD: "HK",
  SGD: "S$",
};

/** Per-currency Chinese display name, surfaced as the secondary label in the picker. */
export const FX_NAME: Record<string, string> = {
  USD: "美元",
  TWD: "新台币",
  VND: "越南盾",
  CNY: "人民币",
  AUD: "澳元",
  INR: "印度卢比",
  EUR: "欧元",
  HKD: "港币",
  SGD: "新加坡元",
};

export function fxFormat(n: number, code: string): string {
  if (code === "VND" || code === "INR") return Math.round(n).toLocaleString();
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  // sub-unit values — reciprocal rates like 1 VND ≈ 0.000038 USD need more precision
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export function fxParse(s: string): number {
  const cleaned = s.replace(/[,\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export const FX_QUICK_PAIRS = ["USD/VND", "USD/TWD", "USD/CNY", "AUD/USD", "EUR/USD"];
