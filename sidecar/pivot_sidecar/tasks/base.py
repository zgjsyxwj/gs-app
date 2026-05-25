from __future__ import annotations
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Iterator
from ..ipc import LogEvent, ProgressEvent, RunResult

# Every task yields events as it works; the server forwards them to the frontend.
TaskEvent = LogEvent | ProgressEvent | RunResult | str   # str = output file path


class TaskBase(ABC):
    task_id: str = ""
    code: str = ""
    name: str = ""
    desc: str = ""
    inputs: list[str] = []

    def descriptor(self) -> dict:
        return {
            "id": self.task_id, "code": self.code, "name": self.name,
            "desc": self.desc, "inputs": self.inputs,
        }

    @abstractmethod
    def run(self, *, input_path: Path, output_dir: Path, options: dict) -> Iterator[TaskEvent]:
        ...
