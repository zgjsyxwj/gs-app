"""Sidecar entry point — stdin/stdout JSON-RPC server.

Tauri starts this binary; we read newline-delimited JSON from stdin and write
events / results back to stdout, one JSON object per line.
"""
from __future__ import annotations
import json, sys, traceback
from . import __version__
from .server import Server
from .ipc import write_line


def main() -> int:
    # Announce ourselves so the Rust side can populate sidecar_status() early.
    write_line({
        "event": "hello",
        "version": __version__,
        "python_version": "%d.%d.%d" % sys.version_info[:3],
    })

    server = Server()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as e:
            write_line({"event": "error", "msg": f"bad json: {e}"})
            continue
        try:
            server.dispatch(req)
        except Exception as e:  # noqa: BLE001
            write_line({
                "id": req.get("id"),
                "event": "done",
                "ok": False,
                "error": str(e),
                "trace": traceback.format_exc(),
            })
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
