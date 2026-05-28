"""微创神通印度报销文件分卷 (MP-IN-REIMBURSE-SPLIT)

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


class MpInTask(TaskBase):
    task_id = "mp-in-reimburse-split"
    code    = "MP-IN-REIMBURSE-SPLIT"
    name    = "微创神通印度报销文件分卷"
    desc    = "按金额拆分文件夹 · 单个 < 10MB · 适配 Paysquare 邮件附件上限"
    inputs  = ["pdf", "xlsx"]

    def run(self, *, input_path: Path, output_dir: Path, options: dict) -> Iterator[TaskEvent]:
        yield LogEvent(f"读取输入：{input_path.name}")
        time.sleep(0.2)

        # ── replace below with the real MP-IN-REIMBURSE-SPLIT pipeline ───────────────────
        # 1. parse input_path  (pandas.read_excel / openpyxl / pypdf …)
        # 2. apply business rules — refer to docs/specs/MP-IN-REIMBURSE-SPLIT.md
        # 3. write outputs into output_dir
        # 4. yield ProgressEvent(...) per step, LogEvent(...) for notable lines
        # ─────────────────────────────────────────────────────────────────────

        total = 5
        for i in range(total):
            time.sleep(0.15)
            yield ProgressEvent(done=i + 1, total=total, note=f"step {i+1}/{total}")
            yield LogEvent(f"processed batch {i+1}")

        out = output_dir / f"MP-IN-REIMBURSE-SPLIT_demo_output.xlsx"
        out.touch()
        yield LogEvent(f"写出：{out}", lvl="ok")
        yield str(out)
