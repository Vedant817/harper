#!/usr/bin/env python3
"""Run every benchmark and write eval/reports/latest.md.

Run this with the evaluation virtualenv so ERRANT is importable:

    eval\\.venv\\Scripts\\python.exe eval\\run_all.py
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

from common import ROOT

VENV = ROOT / "eval" / ".venv" / "Scripts" / "python.exe"


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except AttributeError:
            pass
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-extension", action="store_true", help="do not run Playwright gates")
    parser.add_argument("--limit", type=int, default=0, help="limit sentences per GEC corpus")
    args = parser.parse_args(argv)

    python = str(VENV if VENV.exists() else Path(sys.executable))
    steps = [
        ("personal", [python, "eval/run_personal.py"]),
        ("gec", [python, "eval/run_gec.py"] + (["--limit", str(args.limit)] if args.limit else [])),
        ("spelling", [python, "eval/run_spelling.py"]),
    ]
    if not args.skip_extension:
        steps.append(("extension", [python, "eval/run_extension.py"]))

    statuses: list[tuple[str, int]] = []
    for name, command in steps:
        print(f"\n=== {name} ===", flush=True)
        proc = subprocess.run(
            command,
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        print(proc.stdout[-20000:])
        if proc.returncode != 0 and proc.stderr:
            print(proc.stderr[-4000:], file=sys.stderr)
        statuses.append((name, proc.returncode))

    print("\n=== report ===", flush=True)
    report = subprocess.run(
        [python, "eval/report.py"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    print(report.stdout)
    if report.returncode != 0:
        print(report.stderr, file=sys.stderr)

    print("\nStep results:")
    for name, code in statuses:
        print(f"  {name}: {'ok' if code == 0 else f'exit {code}'}")
    return 0 if all(code == 0 for _, code in statuses) and report.returncode == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
