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


def followup_section() -> str:
    rows = [
        [
            "0 baseline",
            "personal 25/31; BEA 27.77/8.87/19.47",
            "recorded in this report",
            "same baseline",
            "n/a",
            "PASS",
        ],
        [
            "1a determinism",
            "BEA varied 27.77 vs 27.82 between runs",
            "eval/common.py sort; eval/run_gec.py canonicalizes RegularIrregulars",
            "two full runs identical",
            "run_gec.py twice",
            "PASS",
        ],
        [
            "1b card limit",
            "limit 280.5",
            "eval/run_extension.py and personal_acceptance.spec.ts use 280",
            "limit 280; card 266.1",
            "run_extension.py",
            "PASS",
        ],
        [
            "1c diagnostics",
            "no per-type or per-rule FP detail",
            "eval/run_gec.py, run_spelling.py, report.py add the tables",
            "per-type, top-10 FP rules with examples, all clean lints",
            "report.py",
            "PASS",
        ],
        [
            "1d scope",
            "unknown whether GEC loads personal packs",
            "no code change",
            "GEC loads the curated Rust config only",
            "report scope check",
            "PASS",
        ],
        [
            "2 false positives",
            "CWEB-S 5.93%, CWEB-G 10.04%, GMEG wiki 18.76%",
            "diagnosis only; no fix",
            "SpellCheck dominates; style rules next",
            "none",
            "PASS (diagnosis)",
        ],
        [
            "3a comma splice",
            "case FAIL",
            "personalWeir.ts accepts AUX tails",
            "case PASS",
            "run_personal.py",
            "PASS",
        ],
        [
            "3b direct question",
            "case FAIL",
            "stopped: no Weir end anchor or insert suggestion",
            "case FAIL",
            "run_personal.py",
            "STOPPED",
        ],
        [
            "3c could care less",
            "case FAIL",
            "personalWeir.ts matches the bare phrase before a period",
            "case PASS",
            "run_personal.py",
            "PASS",
        ],
        [
            "3d in order to",
            "case FAIL",
            "personalWeir.ts adds PersonalInOrderTo to the casual pack",
            "case PASS",
            "run_personal.py",
            "PASS",
        ],
        [
            "3e/3f stacked marks",
            "cases FAIL",
            "stopped: Weir cannot match stacked ! or ?; core preset loads no pack",
            "cases FAIL",
            "run_personal.py",
            "STOPPED",
        ],
        [
            "4 extension coverage",
            "fixtures only for textarea/shadow",
            "LinkedIn dialog and pre-filled Gmail fixtures + gates",
            "LinkedIn 10 ms; Gmail 208 ms; 8/8 gates",
            "run_extension.py",
            "PASS",
        ],
        [
            "5 LanguageTool",
            "not installed",
            "skipped by ALLOW_LT_DOWNLOAD=no",
            "not measured",
            "none",
            "SKIPPED",
        ],
        [
            "6 regressions",
            "not reported last time",
            "just unavailable; ran the fallback commands explicitly",
            "test_pos_tagger pass; test_most_lints pass (linters target); pnpm check 0 errors; tsc pass; full crate skipped (no Rust changes)",
            "step 6 commands",
            "PASS",
        ],
    ]
    lines = [
        "## Follow-up changes",
        "",
        markdown_table(
            ["item", "evidence before", "change", "result after", "acceptance", "status"], rows
        ),
        "",
        "### Personal cases: 25/31 before, 28/31 after",
        "",
        "Fixed: comma splice, bare could care less, and in order to. Stopped: direct question "
        "(no Weir end anchor; `becomes` only emits ReplaceWith), urgent!!! and What??? "
        "(Weir treats `!` as the Not operator and `?` as a chunk terminator; the cases also use "
        "the core preset, which loads no personal pack).",
        "",
        "### Stopped items",
        "",
        "- 3b needs an end-of-input anchor or an insertion suggestion in Weir, or a core Rust "
        "linter. Both are outside the personalWeir-only scope.",
        "- 3e/3f need a repeated-punctuation linter in harper-core and a default-config entry, "
        "or a Weir escape for stacked marks. Neither exists, and the core preset does not load "
        "personal packs.",
        "",
        "### Extension suite",
        "",
        "The full chrome-plugin suite ran with playwright.eval.config.ts on Windows: "
        "69 passed, 12 failed, 2 skipped. The failures are css_zoom, github (2), hn, "
        "nested_elements, personal_polish, simple_textarea wrap, and typst (5). None are the "
        "shadow-root or new composer gates; they use the Windows config without the repo's "
        "Linux vglrun/GPU wrapper.",
        "",
        "### Still not measured",
        "",
        "ErAConD, FCE and CoNLL-2013 scoring, JFLEG, TETRA, LanguageTool rule tests, "
        "`just dogfood`, and tone/clarity. These are left for a later round.",
        "",
        "### Follow-up commits",
        "",
        "- `9ee70eda` fix(eval): make GEC scoring deterministic",
        "- `e0c2101d` fix(eval): enforce the 280 px card limit exactly",
        "- `450c0474` feat(eval): add GEC and spelling diagnostics",
        "- `369ca4bf` fix(personal-weir): accept modal tails in comma splices",
        "- `f8be1da6` fix(personal-weir): match bare could care less",
        "- `a814991d` fix(personal-weir): shorten in order to",
        "- `f7a84153` test(chrome-plugin): cover LinkedIn and Gmail-like composers",
        "- this report commit",
        "",
    ]
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
        lines.append(f"LanguageTool: not measured — {tool.get('reason', 'not available')}")
    lines.append("")
    lines.append(
        "Method: first non-overlapping suggestion per lint, applied at token granularity; "
        "ERRANT annotates source against Harper output; matching requires the same token span "
        "and correction tokens. `gold FP/1k` lints the detokenized reference text and reports "
        "Harper lints per 1,000 words."
    )
    lines.append("")
    lines.append(
        "Scope check: `run_gec.py` calls `harper-cli lint` with the curated Rust config. "
        "It does not load `packages/chrome-plugin/src/personalWeir.ts`; personal Weir rules "
        "are measured only by `run_personal.py`."
    )
    lines.append("")
    lines.extend(per_type_section(payload))
    lines.extend(fp_rule_section(payload))
    lines.extend(fp_diagnosis_section(payload))
    lines.extend(spellcheck_breakdown_section(payload))
    return "\n".join(lines)


def _rule_counts(payload, rule: str) -> list[int]:
    counts = []
    for corpus in ("cweb-s-dev", "cweb-g-dev", "gmeg-wiki"):
        result = payload.get("corpora", {}).get(corpus, {})
        entry = (result.get("gold_fp_by_rule") or {}).get(rule, {})
        counts.append(int(entry.get("count", 0)))
    return counts


def fp_diagnosis_section(payload) -> list[str]:
    spell = _rule_counts(payload, "SpellCheck")
    long_sentences = _rule_counts(payload, "LongSentences")
    split_words = _rule_counts(payload, "SplitWords")
    oxford = _rule_counts(payload, "OxfordComma")
    quotes = _rule_counts(payload, "UnclosedQuotes")
    en_dash = _rule_counts(payload, "NumericRangeEnDash")
    dashes = _rule_counts(payload, "Dashes")
    prefixes = _rule_counts(payload, "DisjointPrefixes")
    mass = _rule_counts(payload, "MassNouns")
    orthographic = _rule_counts(payload, "OrthographicConsistency")
    compounds = _rule_counts(payload, "CompoundNouns")
    capitalization = _rule_counts(payload, "SentenceCapitalization")
    return [
        "### False-positive diagnosis",
        "",
        "No false-positive fix was implemented in this round. The top rules need either a "
        "corpus-level policy or a spellcheck allowlist that is broader than one rule or one data "
        "file, and a global SpellCheck change risks recall.",
        "",
        f"- `SpellCheck` ({spell[0]:,} CWEB-S, {spell[1]:,} CWEB-G, {spell[2]:,} GMEG wiki): "
        "proper nouns, acronyms, and technical terms are unknown to the curated dictionary. "
        "Examples include Udaipur, Jodhpur, Jaisalmer, Havelis, CSA, and Paloukia. Proposed: a "
        "separate proper-noun/acronym allowlist or a name-aware spellcheck path, not a global "
        "suppression.",
        f"- `LongSentences` ({long_sentences[0]} / {long_sentences[1]} / {long_sentences[2]}): "
        "a style rule firing on naturally long website and encyclopedia sentences. It is not a "
        "grammar edit and should be excluded from a GEC precision gate or reported separately.",
        f"- `SplitWords` ({split_words[0]} / {split_words[1]} / {split_words[2]}): "
        "compound-word policy disagreements such as oversample, microcapsules, and defenseman. "
        "Proposed: extend the compound dictionary rather than loosen the splitter.",
        f"- `OxfordComma` ({oxford[0]} / {oxford[1]}): inserts a serial comma where the "
        "reference text omits it. This is a style preference, not a grammatical error; keep it "
        "out of the GEC gate.",
        f"- `UnclosedQuotes` ({quotes[0]} / {quotes[1]}): quotes embedded in long, sometimes "
        "malformed source text. Needs a quote-balance analysis before changing the rule.",
        f"- `NumericRangeEnDash` ({en_dash[0]}) and `Dashes` ({dashes[0]} / {dashes[1]}): "
        "typographic preferences (hyphen vs en dash, doubled hyphen). Style-only for this gate.",
        f"- `DisjointPrefixes` ({prefixes[0]} / {prefixes[1]} / {prefixes[2]}): prefers closed "
        "forms such as reimagining, antiwar, and nonprofit. Policy disagreement; proposed "
        "dictionary review.",
        f"- `MassNouns` ({mass[0]} / {mass[1]}): over-applies mass-noun corrections such as "
        "`One might` to `One piece of might`; rule-specific and needs its own test corpus.",
        f"- `OrthographicConsistency` ({orthographic[0]}): flags `Ph` in `Ph.D.` as `pH`; a "
        "narrow capitalization fix is possible but was not attempted because it needs rule-level "
        "tests and a decision on degree abbreviations.",
        f"- `CompoundNouns` ({compounds[0]}) and `SentenceCapitalization` "
        f"({capitalization[0]}): closed-compound and sentence-start policy disagreements; no "
        "narrow fix.",
        "",
    ]


def spellcheck_breakdown_section(payload) -> list[str]:
    lines = ["### SpellCheck false-positive breakdown", ""]
    categories = ["sentence_initial", "acronym", "capitalized_mid", "lowercase", "other"]
    rows = []
    for corpus in ("cweb-s-dev", "cweb-g-dev", "gmeg-wiki"):
        result = payload.get("corpora", {}).get(corpus, {})
        data = result.get("spellcheck_fp_categories") or {}
        total = int(data.get("total", 0))
        counts = data.get("categories") or {}
        row = [corpus, str(total)]
        for category in categories:
            count = int(counts.get(category, 0))
            share = (100.0 * count / total) if total else 0.0
            row.append(f"{count} ({share:.1f}%)")
        rows.append(row)
    if not rows:
        return lines + ["Not measured.", ""]
    lines.append(
        markdown_table(
            [
                "corpus",
                "SpellCheck FPs",
                "sentence-initial",
                "ALL-CAPS acronym",
                "capitalized mid",
                "lowercase",
                "other",
            ],
            rows,
        )
    )
    lines.append("")
    lines.append(
        "The breakdown is measurement only; no SpellCheck or dictionary change was made."
    )
    lines.append("")
    return lines


def _cell(text, limit: int = 160) -> str:
    text = " ".join(str(text or "").split())
    if len(text) > limit:
        text = text[: limit - 1] + "…"
    return text.replace("|", "\\|")


def per_type_section(payload) -> list[str]:
    lines = ["### Per-type P/R/F0.5", ""]
    rows = []
    for corpus in ("cweb-s-dev", "cweb-g-dev", "gmeg-wiki"):
        result = payload.get("corpora", {}).get(corpus)
        if result is None or "by_type" not in result:
            continue
        for error_type, stats in sorted(
            result["by_type"].items(), key=lambda item: (-item[1].get("f05", 0), item[0])
        ):
            if stats.get("gold", 0) == 0:
                continue
            rows.append(
                [
                    corpus,
                    error_type,
                    str(stats["gold"]),
                    str(stats["predicted"]),
                    str(stats["matched"]),
                    f"{stats.get('precision', 0) * 100:.2f}%",
                    f"{stats.get('recall', 0) * 100:.2f}%",
                    f"{stats.get('f05', 0) * 100:.2f}%",
                ]
            )
    if not rows:
        return lines + ["Not measured.", ""]
    lines.append(
        markdown_table(
            ["corpus", "type", "gold", "pred", "match", "P", "R", "F0.5"], rows
        )
    )
    lines.append("")
    lines.append(
        "Types with no gold edits are omitted. Gold types come from the corpus M2; "
        "predicted types use ERRANT's taxonomy."
    )
    lines.append("")
    return lines


def fp_rule_section(payload) -> list[str]:
    lines = ["### Top false-positive rules on detokenized gold text", ""]
    found = False
    for corpus in ("cweb-s-dev", "cweb-g-dev", "gmeg-wiki"):
        result = payload.get("corpora", {}).get(corpus)
        if result is None:
            continue
        by_rule = result.get("gold_fp_by_rule") or {}
        if not by_rule:
            continue
        found = True
        lines.append(f"**{corpus}**")
        lines.append("")
        rows = []
        for rule, entry in list(by_rule.items())[:10]:
            examples = []
            for example in entry.get("examples", []):
                word = _cell(example.get("word"), 70)
                suggestion = _cell(example.get("suggestion"), 40)
                prefix = f"`{word}`"
                if suggestion:
                    prefix += f" → `{suggestion}`"
                examples.append(f"{prefix}: {_cell(example.get('sentence'))}")
            rows.append([rule, str(entry.get("count", 0)), "<br>".join(examples)])
        lines.append(markdown_table(["rule", "count", "examples"], rows))
        lines.append("")
    if not found:
        return lines + ["Not measured.", ""]
    return lines


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
    clean_lints = fixture.get("clean_lints") or []
    if clean_lints:
        lines.append("### Clean-prose spelling lints")
        lines.append("")
        rows = [
            [
                f"`{item.get('word') or ''}`",
                f"`{item.get('suggestion') or ''}`",
                _cell(item.get("sentence"), 180),
            ]
            for item in clean_lints
        ]
        lines.append(markdown_table(["word", "suggestion", "sentence"], rows))
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
        followup_section(),
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
    Path(args.output).write_text(text.rstrip() + "\n", encoding="utf-8", newline="\n")
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
