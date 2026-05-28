"""瓦里安越南 Payroll 报告加工 (VA-VN-PAYROLL-REPORT)

按 station (GL / 13th / Variance) 分派处理。前端每个 station 单独发起一次
run；options.station 决定走哪条分支。当前 GL/13th 已实现真实逻辑，Variance
仍为占位实现。

供应商发来的 xlsx 用 ``vnpayroll`` 密码加密；解密后用 openpyxl 原地改若干
单元格（保留样式），再以同样的密码重新加密写回。

GL / 13th 规则一致，只是列名不同：
  - GL 报告：列名 "G/L Acc"
  - 13th 报告：列名 "G/L Code"（也接受 "GL Code"）

对每一行：当 GL 编码以 "2" 开头 → BusinessArea=2000、ProfitCenter=10000000、
CostCenter 清空。以 "6" 开头则不动（供应商已填好 CostCenter）。
"""
from __future__ import annotations
import io
import os
import time
from pathlib import Path
from typing import Iterator

import msoffcrypto
import openpyxl
from openpyxl.workbook import Workbook

from .base import TaskBase, TaskEvent
from ..ipc import LogEvent, ProgressEvent


PASSWORD = "vnpayroll"

# 列名候选（不同年份的模板可能存在轻微差异）
GL_CODE_HEADERS = ("G/L Acc", "G/L Code", "GL Code", "GL Acc")
BA_HEADER = "BusinessArea"
CC_HEADER = "CostCenter"
PC_HEADER = "ProfitCenter"

BA_VALUE = 2000
PC_VALUE = 10000000

# 占位 Variance 仍按原 placeholder 行为输出（保留前端 UI 可用性）
VARIANCE_PLACEHOLDER_BYTES = 142 * 1024


def _decrypt(src: Path, password: str) -> io.BytesIO:
    with open(src, "rb") as f:
        of = msoffcrypto.OfficeFile(f)
        if not of.is_encrypted():
            # 未加密：直接把内容塞进 BytesIO 返回，调用方继续走 openpyxl
            f.seek(0)
            return io.BytesIO(f.read())
        of.load_key(password=password)
        out = io.BytesIO()
        of.decrypt(out)
        out.seek(0)
        return out


def _save_encrypted(wb: Workbook, dst: Path, password: str) -> None:
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    with open(dst, "wb") as fout:
        of = msoffcrypto.OfficeFile(buf)
        of.load_key(password=password)
        of.encrypt(password, fout)


def _find_col(ws, candidates: tuple[str, ...]) -> int | None:
    headers = {(ws.cell(1, c).value or "").strip(): c for c in range(1, ws.max_column + 1)}
    for name in candidates:
        if name in headers:
            return headers[name]
    return None


def _starts_with(value, prefix: str) -> bool:
    if value is None:
        return False
    s = str(value).strip()
    return s.startswith(prefix)


def _process_gl_like(
    input_path: Path,
    output_path: Path,
    code_headers: tuple[str, ...],
    password: str,
) -> tuple[int, int]:
    """处理 GL / 13th 报告。返回 (匹配行数, 总数据行数)。"""
    dec = _decrypt(input_path, password)
    wb = openpyxl.load_workbook(dec, data_only=False)
    ws = wb.active

    code_col = _find_col(ws, code_headers)
    if code_col is None:
        raise ValueError(f"未找到 GL 列：尝试过 {code_headers}")
    ba_col = _find_col(ws, (BA_HEADER,))
    cc_col = _find_col(ws, (CC_HEADER,))
    pc_col = _find_col(ws, (PC_HEADER,))
    missing = [
        name for name, col in (
            (BA_HEADER, ba_col), (CC_HEADER, cc_col), (PC_HEADER, pc_col),
        ) if col is None
    ]
    if missing:
        raise ValueError(f"未找到必需列：{missing}")

    touched = 0
    total = 0
    for r in range(2, ws.max_row + 1):
        gl = ws.cell(r, code_col).value
        if gl is None or str(gl).strip() == "":
            continue
        total += 1
        if _starts_with(gl, "2"):
            ws.cell(r, ba_col).value = BA_VALUE
            ws.cell(r, pc_col).value = PC_VALUE
            ws.cell(r, cc_col).value = None
            touched += 1

    _save_encrypted(wb, output_path, password)
    return touched, total


class VaVnReportTask(TaskBase):
    task_id = "va-vn-payroll-report"
    code    = "VA-VN-PAYROLL-REPORT"
    name    = "瓦里安越南 Payroll 报告加工"
    desc    = "GL CODE 2 填 BusinessArea/ProfitCenter · GL CODE 6 填 CostCenter · Variance 加入职/离职日"
    inputs  = ["xlsx"]

    def run(self, *, input_path: Path, output_dir: Path, options: dict) -> Iterator[TaskEvent]:
        opts = options or {}
        station = str(opts.get("station") or "").strip()
        password = str(opts.get("password") or PASSWORD)

        if station.upper() == "GL":
            yield from self._run_gl_or_13th(
                input_path, output_dir, password,
                kind="GL", code_headers=("G/L Acc", "GL Acc"),
            )
        elif station == "13th":
            yield from self._run_gl_or_13th(
                input_path, output_dir, password,
                kind="13th", code_headers=("G/L Code", "GL Code"),
            )
        elif station.lower() == "variance":
            yield from self._run_variance_placeholder(input_path, output_dir, opts)
        else:
            # 没传 station：保留 placeholder 行为以兼容旧调用
            yield from self._run_legacy_placeholder(output_dir, opts)

    # ── GL / 13th ──────────────────────────────────────────────────────────

    def _run_gl_or_13th(
        self,
        input_path: Path,
        output_dir: Path,
        password: str,
        *,
        kind: str,
        code_headers: tuple[str, ...],
    ) -> Iterator[TaskEvent]:
        yield LogEvent(f"读取 {kind} 报告：{input_path.name}")
        yield ProgressEvent(done=0, total=2, note=f"{kind} · 解密读取")

        out_path = output_dir / input_path.name
        try:
            touched, total = _process_gl_like(input_path, out_path, code_headers, password)
        except Exception as e:  # noqa: BLE001
            yield LogEvent(f"{kind} 处理失败：{e}", lvl="err")
            raise

        yield ProgressEvent(done=1, total=2, note=f"{kind} · 写出")
        yield LogEvent(
            f"{kind}：共 {total} 行，命中 GL CODE 2 开头 {touched} 行",
            lvl="ok",
        )
        yield LogEvent(f"写出：{out_path.name}", lvl="ok")
        yield str(out_path)
        yield ProgressEvent(done=2, total=2, note="done")

    # ── Variance（暂为占位） ─────────────────────────────────────────────

    def _run_variance_placeholder(
        self, input_path: Path, output_dir: Path, options: dict
    ) -> Iterator[TaskEvent]:
        period = options.get("period") or time.strftime("%b %Y")
        dashed = str(period).replace(" ", "-")
        yield LogEvent(f"读取 Variance 输入：{input_path.name} · {period}")
        time.sleep(0.1)
        yield ProgressEvent(done=0, total=1, note="Variance")
        out = output_dir / f"VarianVN_Variance_{dashed}_CDP.xlsx"
        with out.open("wb") as f:
            f.write(os.urandom(VARIANCE_PLACEHOLDER_BYTES))
        yield LogEvent(f"写出：{out.name}（占位）", lvl="warn")
        yield str(out)
        yield ProgressEvent(done=1, total=1, note="done")

    # ── 旧 placeholder（无 station 时） ───────────────────────────────────

    def _run_legacy_placeholder(
        self, output_dir: Path, options: dict
    ) -> Iterator[TaskEvent]:
        period = options.get("period") or time.strftime("%b %Y")
        dashed = str(period).replace(" ", "-")
        subs = [("GL", 184 * 1024), ("13th", 96 * 1024), ("Variance", 142 * 1024)]
        total = len(subs)
        for i, (kind, bytes_) in enumerate(subs):
            time.sleep(0.1)
            yield ProgressEvent(done=i, total=total, note=kind)
            out = output_dir / f"VarianVN_{kind}_{dashed}_CDP.xlsx"
            with out.open("wb") as f:
                f.write(os.urandom(bytes_))
            yield LogEvent(f"写出：{out.name}", lvl="ok")
            yield str(out)
        yield ProgressEvent(done=total, total=total, note="done")
