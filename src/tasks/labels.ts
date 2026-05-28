/**
 * UI-only short display names — distinct from {@link TASKS} in registry.ts,
 * which mirrors the sidecar contract and can't carry UI-only fields.
 *
 * Source of truth for the sidebar menu, the ZIP filename in the Payslip task,
 * and anywhere else we want a compact label.
 */
export const TASK_SHORT: Record<string, string> = {
  "mp-cn-reimburse-summary": "微创 · 报销总表汇总",
  "ww-au-expense-claim": "旺旺AU · 报销单汇总",
  "mp-in-reimburse-split": "神通IN · 拆分报销文件",
  "va-tw-payroll-split": "瓦里安TW · Payroll 账单拆分",
  "va-vn-payroll-report": "瓦里安VN · Payroll 报告加工",
  "va-vn-payslip-rename": "瓦里安VN · Payslip 重命名去水印",
};

export function taskShort(id: string, fallback?: string): string {
  return TASK_SHORT[id] ?? fallback ?? id;
}
