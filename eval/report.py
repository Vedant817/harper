#!/usr/bin/env python3
"""Aggregate the evaluation reports into eval/reports/latest.md."""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from common import REPORTS, markdown_table

PERSONAL = REPORTS / "personal.json"
GEC = REPORTS / "gec.json"
SPELLING = REPORTS / "spelling.json"
EXTENSION = REPORTS / "extension-summary.json"
DOWNLOADS = REPORTS / "downloads.json"

INTENTIONAL_SKIPS = [
    (
        "LanguageTool-stable.zip",
        "252 MB",
        "No local install found. The harness never downloads LanguageTool; the zip is over the 50 MB guard.",
    ),
    (
        "LanguageTool English n-grams",
        "8.96 GB",
        "Not downloaded, by instruction.",
    ),
    (
        "crate-ci/typos repository",
        "~105 MB (GitHub API)",
        "Repository exceeds the 50 MB guard. The smaller typos-dict words.csv is used instead.",
    ),
    (
        "vale-cli/vale repository",
        "~80 MB (GitHub API)",
        "Repository exceeds the 50 MB guard and is not needed for these checks.",
    ),
    (
        "codespell-project/codespell repository",
        "~30 MB (GitHub API)",
        "Not cloned; the raw dictionary.txt is downloaded instead.",
    ),
]


def load(path: Path):
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def personal_section(payload) -> str:
    lines = ["## Personal acceptance cases", ""]
    if payload is None:
        return "\n".join(lines + ["Not run.", ""])
    cases = payload.get("cases", [])
    rows = []
    for case in cases:
        rows.append(
            [
                case.get("id", ""),
                case.get("preset", ""),
                "PASS" if case.get("pass") else "FAIL",
                case.get("reason") or "",
            ]
        )
    passed = sum(1 for case in cases if case.get("pass"))
    lines.append(markdown_table(["case", "preset", "result", "reason"], rows))
    lines.append("")
    lines.append(
        f"**{passed}/{len(cases)} passed.** "
        "A failure here means the browser build does not meet the stated personal contract."
    )
    lines.append("")
    return "\n".join(lines)


def gec_section(payload) -> str:
    lines = ["## Public GEC corpora (ERRANT, token-level)", ""]
    if payload is None:
        return "\n".join(lines + ["Not run.", ""])
    rows = []
    for name, result in payload.get("corpora", {}).items():
        if "error" in result:
            rows.append([name, "-", "-", "-", "-", "-", result["error"][:50]])
            continue
        rows.append(
            [
                name,
                str(result.get("examples", 0)),
                f"{result.get('precision', 0) * 100:.2f}%",
                f"{result.get('recall', 0) * 100:.2f}%",
                f"{result.get('f05', 0) * 100:.2f}%",
                f"{result.get('gold_fp_per_1000_words', 0):.2f}",
                "n/a",
            ]
        )
    lines.append(markdown_table(["corpus", "n", "P", "R", "F0.5", "gold FP/1k", "LanguageTool"], rows))
    lines.append("")
    tool = payload.get("languagetool", {})
    if tool.get("available"):
        lines.append(f"LanguageTool: found at `{tool.get('path')}`; a side-by-side run was not performed.")
    else:
        lines.append(f"LanguageTool: {tool.get('reason', 'not available')}")
    lines.append("")
    lines.append(
        "Method: first non-overlapping suggestion per lint, applied at token granularity; "
        "ERRANT annotates source against Harper output; matching requires the same token span "
        "and correction tokens. `gold FP/1k` lints the detokenized reference text and reports "
        "Harper lints per 1,000 words."
    )
    lines.append("")
    return "\n".join(lines)


def spelling_section(payload) -> str:
    lines = ["## Spelling and developer writing", ""]
    if payload is None:
        return "\n".join(lines + ["Not run.", ""])
    word = payload.get("word_level", {})
    fixture = payload.get("developer_fixtures", {})
    rows = [
        [
            "word-level",
            str(word.get("pairs", 0)),
            f"{word.get('detection', 0) * 100:.2f}%",
            f"{word.get('suggestion_at_1', 0) * 100:.2f}%",
            f"{word.get('suggestion_at_3', 0) * 100:.2f}%",
        ],
        [
            "developer prose",
            str(fixture.get("fixtures", 0)),
            f"{fixture.get('recall', 0) * 100:.2f}%",
            f"{fixture.get('suggestion_at_1', 0) * 100:.2f}%",
            f"{fixture.get('suggestion_at_3', 0) * 100:.2f}%",
        ],
    ]
    lines.append(markdown_table(["set", "n", "detection/recall", "@1", "@3"], rows))
    lines.append("")
    lines.append(
        f"Developer prose fixtures: {fixture.get('substituted', 0)} substituted, "
        f"{fixture.get('injected', 0)} injected; precision {fixture.get('precision', 0) * 100:.2f}%."
    )
    lines.append("")
    lines.append(
        f"Clean prose false positives: {fixture.get('clean_false_positives', 0)} spelling lints "
        f"in {fixture.get('clean_words', 0)} words "
        f"({fixture.get('clean_fp_per_1000_words', 0):.2f} per 1k)."
    )
    lines.append("")
    birkbeck = payload.get("birkbeck_detection", {})
    rows = []
    for name, result in birkbeck.items():
        if "error" in result:
            rows.append([name, "-", "-", result["error"]])
            continue
        rows.append(
            [
                name,
                str(result.get("words", 0)),
                f"{result.get('detection', 0) * 100:.2f}%",
                str(result.get("detected", 0)),
            ]
        )
    if rows:
        lines.append(markdown_table(["Birkbeck list", "sample", "detection", "detected"], rows))
        lines.append("")
    sources = payload.get("sources", {})
    if sources:
        lines.append("Sources: " + ", ".join(f"{name} ({count})" for name, count in sources.items()) + ".")
        lines.append("")
    return "\n".join(lines)


def extension_section(payload) -> str:
    lines = ["## Extension acceptance (Playwright, headed Chromium)", ""]
    if payload is None:
        return "\n".join(lines + ["Not run.", ""])
    rows = []
    for item in payload.get("checks", []):
        rows.append(
            [
                item["check"],
                str(item["observed"]),
                str(item["limit"]),
                "PASS" if item["pass"] else "FAIL",
            ]
        )
    lines.append(markdown_table(["gate", "observed", "limit", "result"], rows))
    lines.append("")
    lines.append(f"**{'All gates passed.' if payload.get('passed') else 'One or more gates failed.'}**")
    lines.append("")
    return "\n".join(lines)


def downloads_section(payload) -> str:
    lines = ["## Downloads", ""]
    if payload:
        rows = [
            [
                entry.get("name", ""),
                entry.get("action", ""),
                str(entry.get("bytes") or ""),
                entry.get("reason") or "",
            ]
            for entry in payload
        ]
        lines.append(markdown_table(["name", "action", "bytes", "reason"], rows))
    else:
        lines.append("No download log.")
    lines.append("")
    lines.append("Intentional skips:")
    lines.append("")
    for name, size, reason in INTENTIONAL_SKIPS:
        lines.append(f"- **{name}** ({size}): {reason}")
    lines.append("")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default=str(REPORTS / "latest.md"))
    args = parser.parse_args(argv)

    personal = load(PERSONAL)
    gec = load(GEC)
    spelling = load(SPELLING)
    extension = load(EXTENSION)
    downloads = load(DOWNLOADS)

    parts = [
        "# Harper evaluation report",
        "",
        f"- Generated: {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}",
        f"- Engine commit: `{(gec or {}).get('commit', 'unknown')}`",
        "- Extension results include the local shadow-root fixes on top of that commit.",
        "- Scope: spelling, grammar, punctuation, and usage only.",
        "- This is an evaluation harness, not a claim of Grammarly Premium parity.",
        "",
        personal_section(personal),
        gec_section(gec),
        spelling_section(spelling),
        extension_section(extension),
        "## Commands",
        "",
        "```",
        "cargo build -p harper-cli",
        "eval\\.venv\\Scripts\\python.exe eval\\run_personal.py",
        "eval\\.venv\\Scripts\\python.exe eval\\run_gec.py",
        "eval\\.venv\\Scripts\\python.exe eval\\run_spelling.py",
        "python eval\\run_extension.py",
        "python eval\\report.py",
        "```",
        "",
        downloads_section(downloads),
    ]
    text = "\n".join(part for part in parts if part is not None)
    Path(args.output).write_text(text.rstrip() + "\n", encoding="utf-8")
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
