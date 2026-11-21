#!/usr/bin/env python3
"""Score Harper on public GEC corpora with ERRANT.

This is an evaluation harness, not a claim of Grammarly Premium parity. It
reports precision, recall, and F0.5 for the edits Harper actually proposes, plus
false positives on the gold text. LanguageTool is used only when a local
installation already exists; this script never downloads it.

Scoring is token-level: harper-cli spans are converted to token spans before
edits are applied, because ERRANT treats its input as pre-tokenized text. That
keeps whitespace normalization (the space before a punctuation mark in the
CoNLL/BEA tokenized corpora) from being scored as a grammar edit.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

from common import (
    CORPORA,
    REPORTS,
    f05,
    git_commit,
    lint_texts,
    markdown_table,
    parse_suggestion,
    pct,
    word_count,
    write_json,
)

# ERRANT is optional at import time so `--help` works before setup.
try:
    import errant  # type: ignore
except ImportError:  # pragma: no cover - exercised on a machine without setup
    errant = None

# Words, contractions, and single punctuation marks are separate tokens. This
# matches both M2 tokenization and the way harper-cli treats punctuation.
TOKEN_RE = re.compile(r"[A-Za-z0-9]+(?:['\u2019][A-Za-z0-9]+)*|[^\s]")


@dataclass(frozen=True)
class Edit:
    """One token-level edit: replace ``o`` with ``c``."""

    o: tuple[str, ...]
    c: tuple[str, ...]
    type: str = "Other"


@dataclass
class Example:
    id: str
    source: str
    target: str | None
    gold: list[Edit] | None = None


def read_lines(path: Path) -> list[str]:
    return path.read_text(encoding="utf-8", errors="replace").splitlines()


def tokenize(text: str) -> list[str]:
    return TOKEN_RE.findall(text)


def detokenize(text: str) -> str:
    """Undo space-before-punctuation tokenization for false-positive checks.

    GMEG reference lines and M2 sources are pre-tokenized. Linting that raw text
    would count the spacing before every comma as a real formatting error.
    """
    text = re.sub(r"\s+([,.;:!?%\)\]])", r"\1", text)
    text = re.sub(r"([\(\[\{])\s+", r"\1", text)
    text = re.sub(r"\s+([\u2019'])(s|t|re|ve|ll|d|m)\b", r"\1\2", text)
    return text


def token_spans(text: str) -> list[tuple[str, int, int]]:
    return [(match.group(0), match.start(), match.end()) for match in TOKEN_RE.finditer(text)]


def char_span_to_tokens(
    spans: Sequence[tuple[str, int, int]], start: int, end: int
) -> tuple[int, int]:
    """Map a character span to the enclosing token indices.

    A zero-width span (an insertion) maps to the token boundary at ``start``.
    """
    token_start = len(spans)
    token_end = len(spans)
    for index, (_, span_start, span_end) in enumerate(spans):
        if span_end <= start:
            continue
        token_start = index
        break
    if end > start:
        token_end = token_start
        for index in range(token_start, len(spans)):
            _, span_start, span_end = spans[index]
            if span_start >= end:
                break
            token_end = index + 1
    else:
        token_end = token_start
    return token_start, token_end


# Rules whose suggestion list comes from an unordered set. The CLI writes the
# set iteration order, so two runs can offer the same corrections in a different
# order. Canonicalize only these before choosing the first suggestion.
UNORDERED_SUGGESTION_RULES = {"RegularIrregulars"}


def ordered_suggestions(lint: dict) -> list[str]:
    suggestions = list(lint.get("suggestions") or [])
    if (lint.get("rule") or "") in UNORDERED_SUGGESTION_RULES:
        suggestions.sort()
    return suggestions


def apply_token_suggestions(source: str, lints: Iterable[dict]) -> tuple[list[str], list[dict]]:
    """Apply the first non-overlapping suggestion per lint at token granularity."""
    spans = token_spans(source)
    tokens = [token for token, _, _ in spans]
    ordered = sorted(
        lints,
        key=lambda lint: (
            lint["span"]["char_start"],
            lint["span"]["char_end"],
            lint.get("rule") or "",
        ),
    )
    applied: list[dict] = []
    taken: list[tuple[int, int]] = []
    for lint in ordered:
        suggestions = ordered_suggestions(lint)
        if not suggestions:
            continue
        parsed = parse_suggestion(suggestions[0])
        if parsed is None:
            continue
        kind, replacement = parsed
        start = int(lint["span"]["char_start"])
        end = int(lint["span"]["char_end"])
        if start < 0 or end > len(source) or start > end:
            continue
        token_start, token_end = char_span_to_tokens(spans, start, end)
        if kind == "insert":
            # Suggestion::InsertAfter inserts at the end of the matched span.
            token_start, token_end = char_span_to_tokens(spans, end, end)
        elif token_start == token_end:
            continue
        conflict = False
        for a, b in taken:
            if token_start == token_end:
                if a < token_start < b:
                    conflict = True
            elif a == b:
                if token_start < a < token_end:
                    conflict = True
            elif not (token_end <= a or token_start >= b):
                conflict = True
        if conflict:
            continue
        replacement_tokens = tokenize(replacement)
        if kind != "insert" and replacement_tokens == tokens[token_start:token_end]:
            continue
        applied.append(
            {
                "token_start": token_start,
                "token_end": token_end,
                "replacement": replacement_tokens,
                "kind": kind,
                "rule": lint.get("rule"),
            }
        )
        taken.append((token_start, token_end))

    if not applied:
        return tokens, []

    result = list(tokens)
    for edit in sorted(
        applied, key=lambda item: (item["token_start"], item["token_end"]), reverse=True
    ):
        result[edit["token_start"] : edit["token_end"]] = edit["replacement"]
    return result, applied


def apply_gold_tokens(source_tokens: Sequence[str], edits: Sequence[Edit]) -> list[str]:
    """Rebuild a reference token list from token-level gold edits."""
    # Gold edits do not carry token indices, so recover them by matching the
    # original token sequence in order.
    result = list(source_tokens)
    cursor = 0
    for edit in edits:
        length = len(edit.o)
        index = cursor
        while index + length <= len(result):
            if tuple(result[index : index + length]) == edit.o:
                result[index : index + length] = list(edit.c)
                cursor = index + len(edit.c)
                break
            index += 1
    return result


def noop_type(error_type: str) -> bool:
    return error_type.strip().lower() in {"noop", "no-op"}


def parse_m2(path: Path) -> list[Example]:
    """Parse an M2 file into examples.

    M2 ``A`` offsets are token indices into the whitespace-tokenized ``S`` line.
    """
    text = path.read_text(encoding="utf-8", errors="replace")
    examples: list[Example] = []
    for block_index, block in enumerate(re.split(r"\n\s*\n", text)):
        lines = [line for line in block.splitlines() if line.strip()]
        if not lines:
            continue
        source_line = next((line for line in lines if line.startswith("S ")), None)
        if source_line is None:
            continue
        source = source_line[2:]
        source_tokens = tokenize(source)
        gold: list[Edit] = []
        seen: set[tuple[tuple[str, ...], tuple[str, ...]]] = set()
        for line in lines:
            if not line.startswith("A "):
                continue
            fields = line[2:].split("|||")
            if len(fields) < 3:
                continue
            try:
                raw_start, raw_end = (int(value) for value in fields[0].split()[:2])
            except (ValueError, IndexError):
                continue
            correction = fields[2]
            error_type = fields[1] or "Other"
            if noop_type(error_type):
                continue
            original = tuple(source_tokens[raw_start:raw_end])
            replaced = tuple(tokenize(correction))
            if original == replaced:
                continue
            key = (original, replaced)
            if key in seen:
                continue
            seen.add(key)
            gold.append(Edit(original, replaced, error_type))
        target = " ".join(apply_gold_tokens(source_tokens, gold))
        examples.append(Example(f"{path.stem}-{block_index}", source, target, gold))
    return examples


def read_parallel(source_path: Path, target_path: Path, prefix: str) -> list[Example]:
    sources = read_lines(source_path)
    targets = read_lines(target_path)
    count = min(len(sources), len(targets))
    return [Example(f"{prefix}-{index}", sources[index], targets[index]) for index in range(count)]


def load_corpus(name: str, limit: int | None) -> list[Example]:
    """Load one corpus by name, returning source/target (and M2 gold if present)."""
    examples: list[Example] = []

    if name in {"conll2014", "conll2013"}:
        root = CORPORA / name
        m2_files = sorted(root.rglob("*.m2"))
        preferred = [path for path in m2_files if "combined" in path.name.lower()]
        chosen = preferred[0] if preferred else (m2_files[0] if m2_files else None)
        if chosen is None:
            raise FileNotFoundError(f"no .m2 file under {root}")
        examples = parse_m2(chosen)

    elif name in {"bea19", "fce"}:
        root = CORPORA / name
        m2_files = sorted(root.rglob("*.m2"))
        if not m2_files:
            raise FileNotFoundError(f"no .m2 file under {root}")
        preferred = [path for path in m2_files if "abcn.dev" in path.name.lower()]
        if not preferred:
            preferred = [path for path in m2_files if "dev" in path.name.lower()]
        chosen = preferred[0] if preferred else m2_files[0]
        examples = parse_m2(chosen)

    elif name.startswith("cweb"):
        # cweb-s-dev, cweb-s-test, cweb-g-dev, cweb-g-test
        _, split, part = name.split("-")
        root = CORPORA / "cweb"
        raw = next((path for path in root.rglob("raw") if path.is_dir()), None)
        if raw is None:
            raise FileNotFoundError("CWEB data/raw not found")
        prefix = f"CWEB-{split.upper()}.{part}"
        source = raw / f"{prefix}.source"
        target = raw / f"{prefix}.ann1"
        examples = read_parallel(source, target, name)

    elif name.startswith("gmeg-"):
        domain = name.split("-", 1)[1]
        root = CORPORA / "gmeg"
        base = next((path for path in root.rglob(domain) if path.is_dir()), None)
        if base is None:
            raise FileNotFoundError(f"GMEG dev/{domain} not found")
        examples = read_parallel(base / "source", base / "ref0", name)

    elif name.startswith("jfleg-"):
        split = name.split("-", 1)[1]
        root = CORPORA / "jfleg"
        base = next((path for path in root.rglob(split) if path.is_dir()), None)
        if base is None:
            raise FileNotFoundError(f"JFLEG {split} not found")
        examples = read_parallel(base / f"{split}.src", base / f"{split}.ref0", name)

    else:
        raise ValueError(f"unknown corpus {name}")

    if limit is not None and limit > 0:
        examples = examples[:limit]
    return examples


def errant_edits(annotator, source_tokens: Sequence[str], target_tokens: Sequence[str]) -> list[Edit]:
    """ERRANT edits between two pre-tokenized token lists."""
    source = " ".join(source_tokens)
    target = " ".join(target_tokens)
    if source == target or not source.strip():
        return []
    try:
        original = annotator.parse(source)
        corrected = annotator.parse(target)
        edits = annotator.annotate(original, corrected)
    except Exception:  # noqa: BLE001 - a single malformed sentence must not stop the corpus
        return []
    result = []
    for edit in edits:
        if edit.o_toks:
            original_tokens = tuple(token.text for token in edit.o_toks)
        else:
            original_tokens = tuple(source_tokens[edit.o_start : edit.o_end])
        if edit.c_toks:
            corrected_tokens = tuple(token.text for token in edit.c_toks)
        else:
            corrected_tokens = tuple(tokenize(edit.c_str))
        if original_tokens == corrected_tokens:
            continue
        result.append(Edit(original_tokens, corrected_tokens, edit.type or "Other"))
    return result


def normalized(tokens: Sequence[str]) -> tuple[str, ...]:
    return tuple(token for token in tokens)


def score_edits(predicted: Sequence[Edit], gold: Sequence[Edit]) -> dict:
    used: set[int] = set()
    matched = 0
    matched_by_type: dict[str, int] = {}
    for prediction in predicted:
        for index, reference in enumerate(gold):
            if index in used:
                continue
            if normalized(prediction.o) == normalized(reference.o) and normalized(
                prediction.c
            ) == normalized(reference.c):
                used.add(index)
                matched += 1
                matched_by_type[reference.type] = matched_by_type.get(reference.type, 0) + 1
                break

    precision = matched / len(predicted) if predicted else 0.0
    recall = matched / len(gold) if gold else 0.0

    predicted_by_type: dict[str, int] = {}
    for prediction in predicted:
        predicted_by_type[prediction.type] = predicted_by_type.get(prediction.type, 0) + 1

    by_type: dict[str, dict] = {}
    for reference in gold:
        stats = by_type.setdefault(reference.type, {"gold": 0, "predicted": 0, "matched": 0})
        stats["gold"] += 1
    for error_type, count in matched_by_type.items():
        by_type.setdefault(error_type, {"gold": 0, "predicted": 0, "matched": 0})["matched"] = count
    for error_type, count in predicted_by_type.items():
        by_type.setdefault(error_type, {"gold": 0, "predicted": 0, "matched": 0})["predicted"] = count
    for stats in by_type.values():
        stats["recall"] = stats["matched"] / stats["gold"] if stats["gold"] else 0.0
        stats["precision"] = stats["matched"] / stats["predicted"] if stats["predicted"] else 0.0
        stats["f05"] = f05(stats["precision"], stats["recall"])

    return {
        "predicted": len(predicted),
        "gold": len(gold),
        "matched": matched,
        "precision": precision,
        "recall": recall,
        "f05": f05(precision, recall),
        "by_type": by_type,
    }


def run_corpus(name: str, examples: list[Example], annotator) -> dict:
    sources = [example.source for example in examples]
    lints = lint_texts(sources)
    by_index: dict[int, list[dict]] = {index: [] for index in range(len(sources))}
    for lint in lints:
        by_index[lint["index"]].append(lint)

    predicted_edits: list[Edit] = []
    gold_edits: list[Edit] = []
    changed = 0
    for index, example in enumerate(examples):
        source_tokens = tokenize(example.source)
        hypothesis_tokens, _ = apply_token_suggestions(example.source, by_index[index])
        if hypothesis_tokens != source_tokens:
            changed += 1
        predicted_edits.extend(errant_edits(annotator, source_tokens, hypothesis_tokens))
        if example.gold is not None:
            gold_edits.extend(example.gold)
        elif example.target is not None:
            gold_edits.extend(
                errant_edits(annotator, source_tokens, tokenize(example.target))
            )

    result = score_edits(predicted_edits, gold_edits)
    result["examples"] = len(examples)
    result["words"] = sum(word_count(example.source) for example in examples)
    result["changed_sentences"] = changed

    # False positives on the gold text: any lint on an already-correct sentence.
    gold_texts = [detokenize(example.target) for example in examples if example.target]
    if gold_texts:
        gold_lints = lint_texts(gold_texts)
        result["gold_false_positives"] = len(gold_lints)
        result["gold_sentences_with_lint"] = len({lint["index"] for lint in gold_lints})
        result["gold_words"] = sum(word_count(text) for text in gold_texts)
        result["gold_fp_per_1000_words"] = (
            1000.0 * len(gold_lints) / result["gold_words"] if result["gold_words"] else 0.0
        )
    else:
        result["gold_false_positives"] = None

    return result


def languagetool_status() -> dict:
    executable = shutil.which("languagetool") or shutil.which("languagetool-commandline")
    if executable:
        return {"available": True, "path": executable, "note": "comparison not run by this script"}
    return {
        "available": False,
        "reason": "No local LanguageTool command found. The 252 MB LanguageTool-stable.zip was not downloaded.",
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "corpora",
        nargs="*",
        default=[
            "cweb-s-dev",
            "cweb-g-dev",
            "gmeg-wiki",
            "gmeg-fce",
            "conll2014",
            "bea19",
        ],
        help="corpus names (default: CWEB dev, GMEG wiki+fce, CoNLL-2014, BEA-2019 dev)",
    )
    parser.add_argument("--limit", type=int, default=0, help="max sentences per corpus (0 = all)")
    parser.add_argument("--output", default=str(REPORTS / "gec.json"))
    args = parser.parse_args(argv)

    if errant is None:
        print(
            "ERRANT is not installed. Create a Python venv and run:\n"
            "  pip install errant\n"
            "  python -m spacy download en_core_web_sm\n"
            "Then run this script with that interpreter.",
            file=sys.stderr,
        )
        return 2

    annotator = errant.load("en")
    results: dict[str, dict] = {}
    for name in args.corpora:
        try:
            examples = load_corpus(name, args.limit or None)
        except (FileNotFoundError, ValueError) as error:
            print(f"{name}: {error}", file=sys.stderr)
            results[name] = {"error": str(error)}
            continue
        print(f"{name}: {len(examples)} examples", file=sys.stderr)
        results[name] = run_corpus(name, examples, annotator)

    payload = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "commit": git_commit(),
        "method": {
            "suggestions": "first suggestion per lint, non-overlapping, applied by token span",
            "edits": "ERRANT 3 annotation of tokenized source vs. Harper output",
            "matching": "exact token span and correction tokens",
            "metric": "precision, recall, F0.5 (beta=0.5)",
            "gold_text": "Harper lints on the reference text, reported as false positives",
            "tokenization": "words and contractions grouped; punctuation separated",
        },
        "languagetool": languagetool_status(),
        "corpora": results,
    }
    write_json(Path(args.output), payload)

    rows = []
    for name, result in results.items():
        if "error" in result:
            rows.append([name, "error", "-", "-", "-", result["error"][:60]])
            continue
        rows.append(
            [
                name,
                str(result["examples"]),
                pct(result["precision"]),
                pct(result["recall"]),
                pct(result["f05"]),
                f"{result.get('gold_fp_per_1000_words', 0):.2f}",
            ]
        )
    print(markdown_table(["corpus", "n", "P", "R", "F0.5", "gold FP/1k"], rows))
    print(
        "\nLanguageTool:",
        "available"
        if payload["languagetool"]["available"]
        else payload["languagetool"]["reason"],
    )
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
