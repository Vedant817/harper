#!/usr/bin/env python3
"""Run the personal acceptance cases against the real browser engine.

The cases live in eval/personal/cases.json. The actual linting happens in
packages/harper.js/src/personalCases.test.ts, because the personal rules are
browser-side Weir packs, not part of the core curated Rust config.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from common import REPORTS, ROOT, markdown_table, write_json

VITEST = ROOT / "packages" / "harper.js" / "node_modules" / "vitest" / "vitest.mjs"
REPORT = REPORTS / "personal.json"


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except AttributeError:
            pass
    if not VITEST.exists():
        print(f"vitest not found at {VITEST}; run `pnpm install` in packages/harper.js", file=sys.stderr)
        return 2

    env = os.environ.copy()
    env["HARPER_PERSONAL_EVAL"] = "1"
    import subprocess

    proc = subprocess.run(
        [
            "node",
            str(VITEST),
            "run",
            "src/personalCases.test.ts",
            "--browser.enabled=false",
            "--reporter=verbose",
        ],
        cwd=str(ROOT / "packages" / "harper.js"),
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=1800,
    )
    if not REPORT.exists():
        print(proc.stdout[-6000:], file=sys.stderr)
        print(proc.stderr[-6000:], file=sys.stderr)
        return 2

    payload = json.loads(REPORT.read_text(encoding="utf-8"))
    cases = payload.get("cases", [])
    failures = [case for case in cases if not case.get("pass")]
    rows = []
    for case in cases:
        observed = "; ".join(
            f"{lint['rule']}={lint['suggestions'][0] if lint['suggestions'] else 'none'}"
            for lint in case.get("observed", [])
        ) or "-"
        rows.append(
            [
                case["id"],
                case["preset"],
                "PASS" if case.get("pass") else "FAIL",
                observed,
                case.get("reason") or "",
            ]
        )

    print(markdown_table(["case", "preset", "result", "observed", "reason"], rows))
    print()
    print(f"{len(cases) - len(failures)}/{len(cases)} personal cases passed.")
    print("This is a spelling/grammar/punctuation/usage gate, not a claim of Grammarly Premium parity.")
    write_json(REPORTS / "personal-summary.json", {"total": len(cases), "passed": len(cases) - len(failures), "failed": len(failures)})
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
