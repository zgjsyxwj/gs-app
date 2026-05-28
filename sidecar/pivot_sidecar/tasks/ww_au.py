"""旺旺澳洲 Expense Claim 整理 (WW-AU-EXPENSE-CLAIM)

This is a placeholder implementation — it walks through the same lifecycle
your real task will use (log / progress / outputs) so the UI is exercisable
end-to-end before the real Python is written.
"""
from __future__ import annotations
import time
from pathlib import Path
from typing import Iterator
from .base import TaskBase, TaskEvent
from ..ipc import LogEvent, ProgressEvent


class WwAuTask(TaskBase):
    task_id = "ww-au-expense-claim"
    code    = "WW-AU-EXPENSE-CLAIM"
    name    = "旺旺澳洲 Expense Claim 整理"
    desc    = "按员工提交日期制作 Expense Claim · 框选单据金额 · 核对系统/实际报销金额"
    inputs  = ["xlsx", "csv"]

    def run(self, *, input_path: Path, output_dir: Path, options: dict) -> Iterator[TaskEvent]:
        yield LogEvent(f"读取输入：{input_path.name}")
        time.sleep(0.2)

        # ── replace below with the real WW-AU-EXPENSE-CLAIM pipeline ───────────────────
        # 1. parse input_path  (pandas.read_excel / openpyxl / pypdf …)
        # 2. apply business rules — refer to docs/specs/WW-AU-EXPENSE-CLAIM.md
        # 3. write outputs into output_dir
        # 4. yield ProgressEvent(...) per step, LogEvent(...) for notable lines
        # ─────────────────────────────────────────────────────────────────────

        total = 5
        for i in range(total):
            time.sleep(0.15)
            yield ProgressEvent(done=i + 1, total=total, note=f"step {i+1}/{total}")
            yield LogEvent(f"processed batch {i+1}")

        out = output_dir / f"WW-AU-EXPENSE-CLAIM_demo_output.xlsx"
        out.touch()
        yield LogEvent(f"写出：{out}", lvl="ok")
        yield str(out)
