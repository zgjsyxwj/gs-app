import type { TaskDescriptor } from "@/lib/ipc";

/**
 * Static task registry — mirrors sidecar/pivot_sidecar/tasks/__init__.py.
 * The sidecar is the source of truth at runtime; this file exists so the
 * frontend can render menus before the sidecar boots.
 */
export const TASKS: TaskDescriptor[] = [
  {
    id: "mp-cn",
    code: "MP-CN",
    name: "微创报销数据处理",
    desc: "对账单字段清洗、合并、按项目编号汇总",
    inputs: ["xlsx"]
  },
  {
    id: "ww-au",
    code: "WW-AU",
    name: "旺旺-澳大利亚报销数据处理",
    desc: "AUD 币种归一、GST 拆列、生成 SAP 导入模板",
    inputs: ["xlsx", "csv"]
  },
  {
    id: "mp-in",
    code: "MP-IN",
    name: "微创神通-印度报销文件整理",
    desc: "原始凭证 PDF 重命名、按月份归档、生成索引",
    inputs: ["pdf", "xlsx"]
  },
  {
    id: "va-pay",
    code: "VA-PAY",
    name: "瓦里安-Payroll 账单拆分",
    desc: "按 Entity / Cost Center 拆分薪资账单为独立工作簿",
    inputs: ["xlsx"]
  },
  {
    id: "va-vn-r",
    code: "VA-VN-R",
    name: "瓦里安越南-Payroll 报告处理",
    desc: "VND 金额取整、按部门生成月度汇总与差异表",
    inputs: ["xlsx"]
  },
  {
    id: "va-vn-ps",
    code: "VA-VN-PS",
    name: "瓦里安越南-Payslip 处理",
    desc: "复制供应商 PDF · 按 {code}_{YYYYMM}.pdf 重命名 · 清除底部水印",
    inputs: ["folder"]
  }
];

export const taskById = (id: string) => TASKS.find(t => t.id === id);
