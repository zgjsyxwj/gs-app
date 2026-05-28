import type { TaskDescriptor } from "@/lib/ipc";

/**
 * Static task registry — mirrors sidecar/pivot_sidecar/tasks/__init__.py.
 * The sidecar is the source of truth at runtime; this file exists so the
 * frontend can render menus before the sidecar boots.
 */
export const TASKS: TaskDescriptor[] = [
  {
    id: "mp-cn-reimburse-summary",
    code: "MP-CN-REIMBURSE-SUMMARY",
    name: "微创报销总表汇总",
    desc: "下载员工票据 · 按国家分类员工 · 总表填写票号/币种/金额/汇率",
    inputs: ["xlsx"],
  },
  {
    id: "ww-au-expense-claim",
    code: "WW-AU-EXPENSE-CLAIM",
    name: "旺旺澳洲 Expense Claim 整理",
    desc: "按员工提交日期制作 Expense Claim · 框选单据金额 · 核对系统/实际报销金额",
    inputs: ["xlsx", "csv"],
  },
  {
    id: "mp-in-reimburse-split",
    code: "MP-IN-REIMBURSE-SPLIT",
    name: "微创神通印度报销文件分卷",
    desc: "按金额拆分文件夹 · 单个 < 10MB · 适配 Paysquare 邮件附件上限",
    inputs: ["pdf", "xlsx"],
  },
  {
    id: "va-tw-payroll-split",
    code: "VA-TW-PAYROLL-SPLIT",
    name: "瓦里安TW Payroll 账单拆分",
    desc: "按 sheet 映射拆成 Salary/OT/Social/Variance 4 个独立工作簿 · 加密",
    inputs: ["xlsx"],
  },
  {
    id: "va-vn-payroll-report",
    code: "VA-VN-PAYROLL-REPORT",
    name: "瓦里安越南 Payroll 报告加工",
    desc: "GL CODE 2 填 BusinessArea/ProfitCenter · GL CODE 6 填 CostCenter · Variance 加入职/离职日",
    inputs: ["xlsx"],
  },
  {
    id: "va-vn-payslip-rename",
    code: "VA-VN-PAYSLIP-RENAME",
    name: "瓦里安越南 Payslip 重命名并去水印",
    desc: "按 {code}_{YYYYMM}.pdf 重命名 · 清除底部水印",
    inputs: ["folder"],
  },
];

export const taskById = (id: string) => TASKS.find((t) => t.id === id);
