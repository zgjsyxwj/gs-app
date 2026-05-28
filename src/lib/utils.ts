import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  const trim = (n: string) => n.replace(/\.0+$/, "");
  if (b < 1024 ** 2) return `${trim((b / 1024).toFixed(1))} KB`;
  if (b < 1024 ** 3) return `${trim((b / 1024 ** 2).toFixed(1))} MB`;
  return `${trim((b / 1024 ** 3).toFixed(2))} GB`;
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
