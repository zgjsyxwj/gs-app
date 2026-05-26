/**
 * UI-only short display names — distinct from {@link TASKS} in registry.ts,
 * which mirrors the sidecar contract and can't carry UI-only fields.
 *
 * Source of truth for the sidebar menu, the ZIP filename in the Payslip task,
 * and anywhere else we want a compact label.
 */
export const TASK_SHORT: Record<string, string> = {
  "mp-cn": "微创 · 报销",
  "ww-au": "旺旺AU · 报销",
  "mp-in": "神通IN · 整理",
  "va-pay": "瓦里安 · 拆分",
  "va-vn-r": "瓦里安VN · Pyaroll报告",
  "va-vn-ps": "瓦里安VN · 工资单",
};

export function taskShort(id: string, fallback?: string): string {
  return TASK_SHORT[id] ?? fallback ?? id;
}
