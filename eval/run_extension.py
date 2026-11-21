#!/usr/bin/env python3
"""Run the personal extension acceptance gates with Playwright.

The gates live in packages/chrome-plugin/tests/personal_acceptance.spec.ts and
write one JSON file per metric under eval/reports/extension. This script clears
stale metrics, runs the headed Chromium config, and turns the metrics into the
same pass/fail contract the user stated.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from common import REPORTS, ROOT, markdown_table, write_json

PLUGIN = ROOT / "packages" / "chrome-plugin"
CONFIG = PLUGIN / "playwright.eval.config.ts"
SPEC = "tests/personal_acceptance.spec.ts"
METRICS = REPORTS / "extension"


def load_metrics() -> dict[str, object]:
    metrics: dict[str, object] = {}
    if not METRICS.exists():
        return metrics
    for path in sorted(METRICS.glob("*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        metrics[payload["name"]] = payload.get("value")
    return metrics


def check(metrics: dict[str, object]) -> list[dict]:
    checks = [
        ("paste underline <= 700 ms", metrics.get("pasteUnderlineMs"), 700),
        ("repeated !!! underline <= 700 ms", metrics.get("repeatedPunctuationMs"), 700),
        ("full draft tail underlined", metrics.get("fullDraftTailUnderlined"), True),
        ("highlight in shadow root", metrics.get("highlightInShadowRoot"), True),
        ("shadow-root editor linted", metrics.get("shadowEditorUnderlined"), True),
        ("LinkedIn dialog paste <= 700 ms", metrics.get("linkedinPasteMs"), 700),
        ("LinkedIn combobox paste <= 700 ms", metrics.get("linkedinComboboxMs"), 700),
        ("Gmail prefilled draft <= 700 ms", metrics.get("gmailLoadMs"), 700),
        ("Gmail pre-filled without focus", metrics.get("gmailUnfocusedMs"), 700),
        ("Gmail localhost unfocused no highlight", metrics.get("localhostUnfocusedHighlights"), 0),
        ("card width <= 280 px", metrics.get("cardWidthPx"), 280),
        ("card opens <= 300 ms", metrics.get("cardOpenMs"), 300),
        ("no dialog calls", metrics.get("dialogCalls"), []),
        ("no open dialog elements", metrics.get("openDialogElements"), 0),
    ]
    results = []
    for name, value, limit in checks:
        if value is None:
            status = "FIXME" if "fixme" in name.lower() else "FAIL"
            results.append(
                {
                    "check": name,
                    "observed": "fixme" if status == "FIXME" else None,
                    "pass": False,
                    "status": status,
                    "limit": "known failure",
                }
            )
            continue
        if isinstance(limit, bool):
            passed = value == limit
        elif isinstance(limit, list):
            passed = value == limit
        elif isinstance(limit, (int, float)):
            passed = float(value) <= float(limit)
        else:
            passed = value == limit
        results.append(
            {
                "check": name,
                "observed": value,
                "pass": passed,
                "status": "PASS" if passed else "FAIL",
                "limit": limit,
            }
        )
    return results


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except AttributeError:
            pass
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-run", action="store_true", help="reuse existing metric files")
    args = parser.parse_args(argv)

    if not (PLUGIN / "build" / "manifest.json").exists():
        print(
            "packages/chrome-plugin/build is missing. Run `pnpm zip-for-chrome` in that package first.",
            file=sys.stderr,
        )
        return 2
    if not CONFIG.exists():
        print(f"missing Playwright config: {CONFIG}", file=sys.stderr)
        return 2

    if not args.skip_run:
        shutil.rmtree(METRICS, ignore_errors=True)
        METRICS.mkdir(parents=True, exist_ok=True)
        env = os.environ.copy()
        env["HARPER_PERSONAL_EVAL"] = "1"
        playwright = PLUGIN / "node_modules" / ".bin" / "playwright.cmd"
        if not playwright.exists():
            playwright = PLUGIN / "node_modules" / ".bin" / "playwright"
        if not playwright.exists():
            print("Playwright is not installed in packages/chrome-plugin.", file=sys.stderr)
            return 2
        proc = subprocess.run(
            [str(playwright), "test", "--config", str(CONFIG), SPEC],
            cwd=str(PLUGIN),
            env=env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=1800,
        )
        print(proc.stdout[-12000:])
        if proc.returncode != 0:
            print(proc.stderr[-4000:], file=sys.stderr)
            # Keep going: the metric table explains which gate failed when a
            # test failed after recording its number.
    metrics = load_metrics()
    checks = check(metrics)
    rows = [
        [item["check"], str(item["observed"]), str(item["limit"]), item["status"]]
        for item in checks
    ]
    print(markdown_table(["gate", "observed", "limit", "result"], rows))
    passed = all(item["status"] != "FAIL" for item in checks)
    write_json(
        REPORTS / "extension-summary.json",
        {"passed": passed, "metrics": metrics, "checks": checks},
    )
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
