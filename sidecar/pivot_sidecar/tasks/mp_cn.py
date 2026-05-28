"""微创报销总表汇总 (MP-CN-REIMBURSE-SUMMARY)

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


class MpCnTask(TaskBase):
    task_id = "mp-cn-reimburse-summary"
    code    = "MP-CN-REIMBURSE-SUMMARY"
    name    = "微创报销总表汇总"
    desc    = "下载员工票据 · 按国家分类员工 · 总表填写票号/币种/金额/汇率"
    inputs  = ["xlsx"]

    def run(self, *, input_path: Path, output_dir: Path, options: dict) -> Iterator[TaskEvent]:
        yield LogEvent(f"读取输入：{input_path.name}")
        time.sleep(0.2)

        # ── replace below with the real MP-CN-REIMBURSE-SUMMARY pipeline ───────────────────
        # 1. parse input_path  (pandas.read_excel / openpyxl / pypdf …)
        # 2. apply business rules — refer to docs/specs/MP-CN-REIMBURSE-SUMMARY.md
        # 3. write outputs into output_dir
        # 4. yield ProgressEvent(...) per step, LogEvent(...) for notable lines
        # ─────────────────────────────────────────────────────────────────────

        total = 5
        for i in range(total):
            time.sleep(0.15)
            yield ProgressEvent(done=i + 1, total=total, note=f"step {i+1}/{total}")
            yield LogEvent(f"processed batch {i+1}")

        out = output_dir / f"MP-CN-REIMBURSE-SUMMARY_demo_output.xlsx"
        out.touch()
        yield LogEvent(f"写出：{out}", lvl="ok")
        yield str(out)
