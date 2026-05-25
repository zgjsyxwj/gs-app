"""Dispatches inbound requests onto the task registry."""
from __future__ import annotations
import time
from pathlib import Path
from .ipc import write_line, RunResult, LogEvent, ProgressEvent
from .tasks import REGISTRY


class Server:
    def __init__(self) -> None:
        self._cancel: set[str] = set()

    def dispatch(self, req: dict) -> None:
        method = req.get("method")
        if method == "run":
            self._run(req)
        elif method == "cancel":
            self._cancel.add(req.get("id", ""))
        elif method == "list_tasks":
            write_line({
                "id": req.get("id"),
                "event": "tasks",
                "tasks": [t.descriptor() for t in REGISTRY.values()],
            })
        else:
            write_line({"id": req.get("id"), "event": "error", "msg": f"unknown method: {method}"})

    def _run(self, req: dict) -> None:
        run_id = req["id"]
        params = req.get("params") or {}
        task_id = params.get("task_id", "")
        if task_id not in REGISTRY:
            RunResult(False, 0, [], [f"unknown task: {task_id}"]).emit(run_id)
            return

        task = REGISTRY[task_id]
        t0 = time.monotonic()
        LogEvent(f"启动任务 {task.code} · {task.name}").emit(run_id)

        input_path = Path(params.get("input", ""))
        output_dir = Path(params.get("output_dir", ""))
        if not input_path.exists():
            LogEvent(f"输入文件不存在: {input_path}", lvl="err").emit(run_id)
            RunResult(False, int((time.monotonic() - t0) * 1000), [], [f"input not found: {input_path}"]).emit(run_id)
            return
        try:
            output_dir.mkdir(parents=True, exist_ok=True)
        except OSError as e:
            LogEvent(f"无法创建输出目录 {output_dir}: {e}", lvl="err").emit(run_id)
            RunResult(False, int((time.monotonic() - t0) * 1000), [], [f"mkdir failed: {e}"]).emit(run_id)
            return

        try:
            outputs: list[str] = []
            warnings: list[str] = []
            for ev in task.run(
                input_path=input_path,
                output_dir=output_dir,
                options=params.get("options") or {},
            ):
                if run_id in self._cancel:
                    LogEvent("已取消", lvl="warn").emit(run_id)
                    RunResult(False, int((time.monotonic() - t0) * 1000), outputs, warnings).emit(run_id)
                    return
                if isinstance(ev, RunResult):
                    ev.emit(run_id)
                    return
                if isinstance(ev, ProgressEvent):
                    ev.emit(run_id)
                elif isinstance(ev, LogEvent):
                    ev.emit(run_id)
                    if ev.lvl == "warn": warnings.append(ev.msg)
                else:
                    outputs.append(str(ev))

            RunResult(True, int((time.monotonic() - t0) * 1000), outputs, warnings).emit(run_id)
        except Exception as e:  # noqa: BLE001
            LogEvent(f"任务失败: {e}", lvl="err").emit(run_id)
            RunResult(False, int((time.monotonic() - t0) * 1000), [], [str(e)]).emit(run_id)
