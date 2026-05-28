"""瓦里安TW Payroll 账单拆分 (VA-TW-PAYROLL-SPLIT)

按预定义的 sheet 映射，把一个供应商 xlsx 拆成 4 个独立 xlsx：
  · 部門薪資總表 + 員工薪資表 → Varian_Salary Report.xlsx
  · 員工加班費明細表           → Varian_OT Details Report.xlsx
  · 保險資料明細               → Varian_Social Details Report.xlsx
  · 薪資差異分析表             → Varian_Variance Report.xlsx

文件名前缀 = options['period']，输出文件用 options['password'] 加密 (ECMA-376 Agile)。
"""
from __future__ import annotations
from pathlib import Path
from typing import Iterator

from openpyxl import load_workbook

from .base import TaskBase, TaskEvent
from ..ipc import LogEvent, ProgressEvent


# (输出文件名后缀, 保留的 sheet 列表) — 顺序与前端 SPLITS 一致
SPLITS: list[tuple[str, list[str]]] = [
    ("Varian_Salary Report.xlsx", ["部門薪資總表", "員工薪資表"]),
    ("Varian_OT Details Report.xlsx", ["員工加班費明細表"]),
    ("Varian_Social Details Report.xlsx", ["保險資料明細"]),
    ("Varian_Variance Report.xlsx", ["薪資差異分析表"]),
]


def _encrypt_in_place(path: Path, password: str) -> None:
    """对一个明文 xlsx 加密 (ECMA-376 Agile)，覆盖原文件。"""
    import msoffcrypto

    tmp = path.with_suffix(path.suffix + ".tmp")
    try:
        with open(path, "rb") as fin, open(tmp, "wb") as fout:
            msoffcrypto.OfficeFile(fin).encrypt(password, fout)
        tmp.replace(path)
    except Exception:
        if tmp.exists():
            tmp.unlink()
        raise


class VaTwPayrollSplitTask(TaskBase):
    task_id = "va-tw-payroll-split"
    code = "VA-TW-PAYROLL-SPLIT"
    name = "瓦里安TW Payroll 账单拆分"
    desc = "按 sheet 映射拆成 Salary/OT/Social/Variance 4 个独立工作簿 · 加密"
    inputs = ["xlsx"]

    def run(
        self, *, input_path: Path, output_dir: Path, options: dict
    ) -> Iterator[TaskEvent]:
        period = str(options.get("period") or "").strip()
        password = str(options.get("password") or "").strip()
        if not period:
            yield LogEvent("缺少 period (yyyyMM) 参数", lvl="err")
            return

        yield LogEvent(f"读取输入：{input_path.name}")

        # 先校验所有需要的 sheet 都在
        all_needed = [name for _, names in SPLITS for name in names]
        probe = load_workbook(input_path, read_only=True, data_only=False)
        existing = set(probe.sheetnames)
        probe.close()
        missing = [n for n in all_needed if n not in existing]
        if missing:
            yield LogEvent(
                f"账单缺少预期 sheet：{', '.join(missing)}", lvl="err"
            )
            return

        total = len(SPLITS)
        for i, (out_suffix, keep) in enumerate(SPLITS):
            out_name = f"{period}_{out_suffix}"
            out_path = output_dir / out_name
            yield LogEvent(f"生成：{out_name}")

            # 每个输出都重新载入源文件 → 删除不需要的 sheet → 另存。
            # 这样比手工 copy 行更可靠，能完整保留样式 / 合并单元格 /
            # 列宽 / 行高 / 公式。源文件不会被修改。
            wb = load_workbook(input_path)
            keep_set = set(keep)
            for name in list(wb.sheetnames):
                if name not in keep_set:
                    del wb[name]
            # 保持 SPLITS 中声明的顺序
            order = {name: idx for idx, name in enumerate(keep)}
            wb._sheets.sort(key=lambda ws: order.get(ws.title, len(order)))
            wb.save(out_path)
            wb.close()

            if password:
                _encrypt_in_place(out_path, password)

            yield ProgressEvent(done=i + 1, total=total, note=out_name)
            yield str(out_path)

        yield LogEvent("拆分完成", lvl="ok")
