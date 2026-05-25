"""Bundle pivot-sidecar into a single-file binary via PyInstaller.

CI calls this on each platform; the output is renamed to include the
Rust target-triple so Tauri's `externalBin` manifest picks it up.

Usage:
    python build.py [--target <triple>]
"""

from __future__ import annotations
import argparse, os, platform, shutil, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"
BIN_OUT = ROOT.parent / "src-tauri" / "binaries"


def host_target_triple() -> str:
    # Match Rust's default target-triples — keep these consistent with the CI matrix.
    m = platform.machine().lower()
    s = sys.platform
    if s.startswith("darwin"):
        return ("aarch64-apple-darwin" if m in {"arm64", "aarch64"} else "x86_64-apple-darwin")
    if s.startswith("linux"):
        return "x86_64-unknown-linux-gnu"
    if s.startswith("win"):
        return "x86_64-pc-windows-msvc"
    raise SystemExit(f"unknown platform: {s}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", default=os.environ.get("TAURI_TARGET") or host_target_triple())
    args = ap.parse_args()

    BIN_OUT.mkdir(parents=True, exist_ok=True)

    if DIST.exists():
        shutil.rmtree(DIST)

    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--name", "pivot-sidecar",
        "--onefile",
        "--clean",
        "--noconfirm",
        "--paths", ".",
        "--collect-submodules", "pivot_sidecar",
        "launcher.py",
    ]
    print("$", " ".join(cmd))
    subprocess.check_call(cmd, cwd=ROOT)

    ext = ".exe" if sys.platform.startswith("win") else ""
    src = DIST / f"pivot-sidecar{ext}"
    dst = BIN_OUT / f"pivot-sidecar-{args.target}{ext}"
    shutil.copy2(src, dst)
    print(f"-> {dst}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
