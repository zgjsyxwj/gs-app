"""IPC protocol primitives.

We use plain dicts so this file has zero deps and can be vendored anywhere.
"""
from __future__ import annotations
import json, sys, time
from dataclasses import dataclass, asdict
from typing import Iterable


def write_line(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def now() -> str:
    return time.strftime("%H:%M:%S", time.localtime()) + f".{int(time.time()*1000) % 1000:03d}"


@dataclass
class LogEvent:
    msg: str
    lvl: str = "info"   # info | warn | ok | err

    def emit(self, run_id: str) -> None:
        write_line({"id": run_id, "event": "log", "t": now(), "lvl": self.lvl, "msg": self.msg})


@dataclass
class ProgressEvent:
    done: int
    total: int
    note: str = ""

    def emit(self, run_id: str) -> None:
        write_line({
            "id": run_id, "event": "progress",
            "done": self.done, "total": self.total, "note": self.note,
        })


@dataclass
class RunResult:
    ok: bool
    duration_ms: int
    outputs: list[str]
    warnings: list[str]

    def emit(self, run_id: str) -> None:
        write_line({"id": run_id, "event": "done", **asdict(self)})


Event = LogEvent | ProgressEvent


def drain(run_id: str, stream: Iterable[Event]) -> None:
    for ev in stream:
        ev.emit(run_id)
