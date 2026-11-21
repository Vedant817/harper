#!/usr/bin/env python3
"""Spelling and developer-writing checks.

This measures word-level typo detection, suggestion@1/@3, and false positives on
clean prose. It is deliberately separate from the GEC score: a spelling lint is
not a grammar edit, and a clean file with a proper noun is not a miss.
"""

from __future__ import annotations

import argparse
import json
import random
import re
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

from common import (
    CORPORA,
    DOWNLOADS,
    REPORTS,
    ROOT,
    fetch,
    lint_texts,
    markdown_table,
    parse_suggestion,
    pct,
    word_count,
    write_json,
)

CODESPELL_URL = "https://raw.githubusercontent.com/codespell-project/codespell/main/codespell_lib/data/dictionary.txt"
WIKIPEDIA_URL = "https://en.wikipedia.org/wiki/Wikipedia:Lists_of_common_misspellings/For_machines?action=raw"
TYPOS_URL = "https://raw.githubusercontent.com/crate-ci/typos/master/crates/typos-dict/assets/words.csv"
BIRKBECK = {
    "missp": "https://www.dcs.bbk.ac.uk/~roger/missp.dat",
    "holbrook": "https://www.dcs.bbk.ac.uk/~roger/holbrook-missp.dat",
    "aspell": "https://www.dcs.bbk.ac.uk/~roger/aspell.dat",
    "wikipedia": "https://www.dcs.bbk.ac.uk/~roger/wikipedia.dat",
}


@dataclass
class Pair:
    typo: str
    correct: str
    source: str


def fetch_text(url: str, name: str) -> str | None:
    path = fetch(url, DOWNLOADS / f"spelling-{name}.txt", name=f"spelling-{name}")
    if path is None:
        return None
    return path.read_text(encoding="utf-8", errors="replace")


def parse_arrow_pairs(text: str, source: str) -> list[Pair]:
    pairs: list[Pair] = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "->" not in line:
            continue
        typo, _, rest = line.partition("->")
        correct = rest.split(",")[0].strip()
        typo = typo.strip()
        if not typo or not correct or " " in typo or " " in correct:
            continue
        pairs.append(Pair(typo, correct, source))
    return pairs


def load_pairs() -> tuple[list[Pair], dict[str, str]]:
    pairs: list[Pair] = []
    notes: dict[str, str] = {}

    codespell = fetch_text(CODESPELL_URL, "codespell")
    if codespell:
        parsed = parse_arrow_pairs(codespell, "codespell")
        pairs.extend(parsed)
        notes["codespell"] = f"{len(parsed)} pairs"
    else:
        notes["codespell"] = "unavailable"

    wikipedia = fetch_text(WIKIPEDIA_URL, "wikipedia")
    if wikipedia:
        parsed = parse_arrow_pairs(wikipedia, "wikipedia")
        pairs.extend(parsed)
        notes["wikipedia"] = f"{len(parsed)} pairs"
    else:
        notes["wikipedia"] = "unavailable"

    typos = fetch_text(TYPOS_URL, "typos")
    if typos:
        parsed: list[Pair] = []
        for line in typos.splitlines()[1:]:
            fields = [field.strip() for field in line.split(",")]
            if len(fields) < 2:
                continue
            typo, correct = fields[0], fields[1]
            if typo and correct and " " not in typo and " " not in correct:
                parsed.append(Pair(typo, correct, "typos-cli"))
        pairs.extend(parsed)
        notes["typos-cli"] = f"{len(parsed)} pairs"
    else:
        notes["typos-cli"] = "unavailable"

    # Deduplicate by (typo, correct), keeping the first source.
    seen: set[tuple[str, str]] = set()
    unique: list[Pair] = []
    for pair in pairs:
        key = (pair.typo.lower(), pair.correct.lower())
        if key in seen:
            continue
        seen.add(key)
        unique.append(pair)
    return unique, notes


def clean_prose(limit: int = 200) -> list[str]:
    """Extract plain prose lines from the repository documentation."""
    lines: list[str] = []
    docs = ROOT / "packages" / "web" / "src" / "routes" / "docs"
    for path in sorted(docs.rglob("*.md")):
        text = path.read_text(encoding="utf-8", errors="replace")
        text = re.sub(r"```.*?```", "", text, flags=re.S)
        for line in text.splitlines():
            line = line.strip()
            if line.startswith(("#", "|", ">", "-", "*", "`")):
                continue
            line = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", line)
            line = re.sub(r"[*_`]", "", line)
            if len(line.split()) >= 7 and line.endswith((".", "!", "?")):
                lines.append(line)
                if len(lines) >= limit:
                    return lines
    return lines


def developer_prose(limit: int = 60) -> list[str]:
    """Comments from the Rust sources, used as developer-writing fixtures."""
    lines: list[str] = []
    for path in sorted((ROOT / "harper-core" / "src").rglob("*.rs")):
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            stripped = line.strip()
            if not stripped.startswith("//") or stripped.startswith("///"):
                continue
            comment = stripped.lstrip("/").strip()
            if len(comment.split()) >= 6 and comment.endswith((".", "!", "?")):
                lines.append(comment)
                if len(lines) >= limit:
                    return lines
    return lines


def seed(sentence: str, correct: str, typo: str) -> tuple[str, tuple[int, int]] | None:
    match = re.search(rf"\b{re.escape(correct)}\b", sentence, flags=re.I)
    if match is None:
        return None
    replacement = typo
    if match.group(0)[0].isupper():
        replacement = typo[:1].upper() + typo[1:]
    start = match.start()
    return sentence[:start] + replacement + sentence[match.end() :], (start, start + len(replacement))


def spelling_lints(lints: list[dict]) -> list[dict]:
    return [
        lint
        for lint in lints
        if "spell" in str(lint.get("kind", "")).lower() or "spell" in str(lint.get("rule", "")).lower()
    ]


def overlaps(lint: dict, span: tuple[int, int]) -> bool:
    start, end = lint["span"]["char_start"], lint["span"]["char_end"]
    return not (end <= span[0] or start >= span[1])


SPELL_POLICIES = ("capitalized_mid", "acronym_2_5", "both")


def spell_category(word: str, sentence: str) -> str:
    cleaned = word.strip(".,;:!?()[]{}'\"")
    tokens = re.findall(r"[A-Za-z][A-Za-z'\u2019-]*", sentence)
    first = tokens[0] if tokens else ""
    if cleaned and cleaned.lower() == first.lower() and cleaned[:1].isupper():
        return "sentence_initial"
    if len(cleaned) >= 2 and cleaned.isupper():
        return "acronym"
    if cleaned[:1].isupper():
        return "capitalized_mid"
    if cleaned[:1].islower():
        return "lowercase"
    return "other"


def suppressed_lint(lint: dict, sentence: str, policy: str) -> bool:
    word = (lint.get("matched_text") or "").strip(".,;:!?()[]{}'\"")
    category = spell_category(word, sentence)
    acronym = category == "acronym" and 2 <= len(word) <= 5
    if policy == "capitalized_mid":
        return category == "capitalized_mid"
    if policy == "acronym_2_5":
        return acronym
    return category == "capitalized_mid" or acronym


def suggestion_texts(lints: list[dict]) -> list[str]:
    texts: list[str] = []
    for lint in lints:
        for raw in lint.get("suggestions", []):
            parsed = parse_suggestion(raw)
            if parsed is not None:
                texts.append(parsed[1])
    return texts


def run_word_level(pairs: list[Pair], limit: int) -> dict:
    random.seed(20261121)
    sample = random.sample(pairs, min(limit, len(pairs)))
    texts = [f"Please check the {pair.typo} before sending." for pair in sample]
    lints = spelling_lints(lint_texts(texts))
    by_index: dict[int, list[dict]] = {index: [] for index in range(len(texts))}
    for lint in lints:
        by_index[lint["index"]].append(lint)

    detected = 0
    at1 = 0
    at3 = 0
    misses: list[dict] = []
    for index, pair in enumerate(sample):
        span = (texts[index].find(pair.typo), texts[index].find(pair.typo) + len(pair.typo))
        hits = [lint for lint in by_index[index] if overlaps(lint, span)]
        if hits:
            detected += 1
            suggestions = suggestion_texts(hits)
            if suggestions and suggestions[0].lower() == pair.correct.lower():
                at1 += 1
            if any(suggestion.lower() == pair.correct.lower() for suggestion in suggestions[:3]):
                at3 += 1
        elif len(misses) < 25:
            misses.append({"typo": pair.typo, "correct": pair.correct, "source": pair.source})

    total = len(sample)
    suppression = {}
    for policy in SPELL_POLICIES:
        policy_detected = 0
        policy_at1 = 0
        policy_at3 = 0
        for index, pair in enumerate(sample):
            span = (
                texts[index].find(pair.typo),
                texts[index].find(pair.typo) + len(pair.typo),
            )
            hits = [
                lint
                for lint in by_index[index]
                if overlaps(lint, span)
                and not suppressed_lint(lint, texts[index], policy)
            ]
            if not hits:
                continue
            policy_detected += 1
            suggestions = suggestion_texts(hits)
            if suggestions and suggestions[0].lower() == pair.correct.lower():
                policy_at1 += 1
            if any(suggestion.lower() == pair.correct.lower() for suggestion in suggestions[:3]):
                policy_at3 += 1
        suppression[policy] = {
            "detected": policy_detected,
            "detection": policy_detected / total if total else 0.0,
            "suggestion_at_1": policy_at1 / total if total else 0.0,
            "suggestion_at_3": policy_at3 / total if total else 0.0,
        }
    return {
        "pairs": total,
        "detected": detected,
        "detection": detected / total if total else 0.0,
        "suggestion_at_1": at1 / total if total else 0.0,
        "suggestion_at_3": at3 / total if total else 0.0,
        "misses": misses,
        "suppression": suppression,
    }


def inject_random_word(sentence: str, typo: str) -> tuple[str, tuple[int, int]] | None:
    spans = [(match.start(), match.end()) for match in re.finditer(r"[A-Za-z]{3,}", sentence)]
    if not spans:
        return None
    start, end = random.choice(spans)
    return sentence[:start] + typo + sentence[end:], (start, start + len(typo))


def run_fixture(pairs: list[Pair], clean: list[str], limit: int) -> dict:
    """Seed typos into developer comments and measure span detection and suggestions."""
    if not clean:
        return {
            "fixtures": 0,
            "substituted": 0,
            "injected": 0,
            "detected": 0,
            "recall": 0.0,
            "precision": 0.0,
            "suggestion_at_1": 0.0,
            "suggestion_at_3": 0.0,
            "clean_sentences": 0,
            "clean_words": 0,
            "clean_false_positives": 0,
            "clean_fp_per_1000_words": 0.0,
        }
    random.seed(20261122)
    selected = random.sample(pairs, min(limit, len(pairs)))
    fixtures: list[tuple[str, str, tuple[int, int] | None, str]] = []
    for pair in selected:
        seeded = None
        for sentence in random.sample(clean, min(200, len(clean))):
            seeded = seed(sentence, pair.correct, pair.typo)
            if seeded is not None:
                fixtures.append((seeded[0], pair.correct, seeded[1], "substituted"))
                break
        if seeded is not None:
            continue
        sentence = random.choice(clean)
        injected = inject_random_word(sentence, pair.typo)
        if injected is not None:
            fixtures.append((injected[0], pair.correct, injected[1], "injected"))

    texts = [fixture[0] for fixture in fixtures]
    lints = spelling_lints(lint_texts(texts)) if texts else []
    by_index: dict[int, list[dict]] = {index: [] for index in range(len(texts))}
    for lint in lints:
        by_index[lint["index"]].append(lint)

    detected = 0
    at1 = 0
    at3 = 0
    predicted = len(lints)
    for index, (_, correct, span, _) in enumerate(fixtures):
        if span is None:
            continue
        hits = [lint for lint in by_index[index] if overlaps(lint, span)]
        if hits:
            detected += 1
            suggestions = suggestion_texts(hits)
            if suggestions and suggestions[0].lower() == correct.lower():
                at1 += 1
            if any(suggestion.lower() == correct.lower() for suggestion in suggestions[:3]):
                at3 += 1

    clean_lints = spelling_lints(lint_texts(clean)) if clean else []
    clean_words = sum(word_count(text) for text in clean)
    clean_details = []
    for lint in clean_lints:
        suggestion = None
        suggestions = lint.get("suggestions") or []
        if suggestions:
            parsed = parse_suggestion(suggestions[0])
            suggestion = parsed[1] if parsed is not None else None
        clean_details.append(
            {
                "word": lint.get("matched_text"),
                "rule": lint.get("rule"),
                "suggestion": suggestion,
                "sentence": clean[lint["index"]],
            }
        )
    fixture_suppression = {}
    for policy in SPELL_POLICIES:
        policy_detected = 0
        policy_at1 = 0
        policy_at3 = 0
        for index, (_, correct, span, _) in enumerate(fixtures):
            if span is None:
                continue
            hits = [
                lint
                for lint in by_index[index]
                if overlaps(lint, span)
                and not suppressed_lint(lint, texts[index], policy)
            ]
            if not hits:
                continue
            policy_detected += 1
            suggestions = suggestion_texts(hits)
            if suggestions and suggestions[0].lower() == correct.lower():
                policy_at1 += 1
            if any(suggestion.lower() == correct.lower() for suggestion in suggestions[:3]):
                policy_at3 += 1
        fixture_suppression[policy] = {
            "detected": policy_detected,
            "recall": policy_detected / len(fixtures) if fixtures else 0.0,
            "suggestion_at_1": policy_at1 / len(fixtures) if fixtures else 0.0,
            "suggestion_at_3": policy_at3 / len(fixtures) if fixtures else 0.0,
        }

    return {
        "fixtures": len(fixtures),
        "substituted": sum(1 for fixture in fixtures if fixture[3] == "substituted"),
        "injected": sum(1 for fixture in fixtures if fixture[3] == "injected"),
        "detected": detected,
        "recall": detected / len(fixtures) if fixtures else 0.0,
        "precision": detected / predicted if predicted else 0.0,
        "suggestion_at_1": at1 / len(fixtures) if fixtures else 0.0,
        "suggestion_at_3": at3 / len(fixtures) if fixtures else 0.0,
        "clean_sentences": len(clean),
        "clean_words": clean_words,
        "clean_false_positives": len(clean_lints),
        "clean_fp_per_1000_words": 1000.0 * len(clean_lints) / clean_words if clean_words else 0.0,
        "clean_lints": clean_details,
        "suppression": fixture_suppression,
    }


def run_birkbeck(limit: int = 200) -> dict:
    results: dict[str, dict] = {}
    for name, url in BIRKBECK.items():
        text = fetch_text(url, f"birkbeck-{name}")
        if text is None:
            results[name] = {"error": "unavailable"}
            continue
        words = []
        for line in text.splitlines():
            line = line.strip()
            if not line or line.startswith(("#", "$", "//")):
                continue
            word = line.split()[0]
            if re.fullmatch(r"[A-Za-z][A-Za-z'\u2019\-]*", word):
                words.append(word)
        random.seed(20261123)
        sample = random.sample(words, min(limit, len(words)))
        texts = [f"Please check the {word} before sending." for word in sample]
        lints = spelling_lints(lint_texts(texts))
        by_index: dict[int, list[dict]] = {index: [] for index in range(len(texts))}
        for lint in lints:
            by_index[lint["index"]].append(lint)
        detected = 0
        for index, word in enumerate(sample):
            span = (texts[index].find(word), texts[index].find(word) + len(word))
            if any(overlaps(lint, span) for lint in by_index[index]):
                detected += 1
        policy_results = {}
        for policy in SPELL_POLICIES:
            policy_detected = 0
            for index, word in enumerate(sample):
                span = (texts[index].find(word), texts[index].find(word) + len(word))
                if any(
                    overlaps(lint, span)
                    and not suppressed_lint(lint, texts[index], policy)
                    for lint in by_index[index]
                ):
                    policy_detected += 1
            policy_results[policy] = {
                "detected": policy_detected,
                "detection": policy_detected / len(sample) if sample else 0.0,
            }
        results[name] = {
            "words": len(sample),
            "detected": detected,
            "detection": detected / len(sample) if sample else 0.0,
            "suppression": policy_results,
        }
    return results


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=300, help="word pairs per source")
    parser.add_argument("--fixtures", type=int, default=60, help="seeded developer-prose fixtures")
    parser.add_argument("--output", default=str(REPORTS / "spelling.json"))
    args = parser.parse_args(argv)

    pairs, notes = load_pairs()
    if not pairs:
        print("No spelling pairs available. Check eval/reports/downloads.json.", file=sys.stderr)
        return 2

    clean = clean_prose(500)
    developer = developer_prose(200)
    fixture_sentences = developer if len(developer) >= 20 else clean
    payload = {
        "generatedAt": __import__("time").strftime("%Y-%m-%dT%H:%M:%SZ", __import__("time").gmtime()),
        "sources": notes,
        "word_level": run_word_level(pairs, args.limit),
        "developer_fixtures": run_fixture(pairs, fixture_sentences, args.fixtures),
        "birkbeck_detection": run_birkbeck(),
        "developer_clean_prose": {
            "sentences": len(developer),
            "spelling_lints": len(spelling_lints(lint_texts(developer))) if developer else 0,
        },
    }
    write_json(Path(args.output), payload)

    word = payload["word_level"]
    fixture = payload["developer_fixtures"]
    rows = [
        ["word-level", str(word["pairs"]), pct(word["detection"]), pct(word["suggestion_at_1"]), pct(word["suggestion_at_3"])],
        [
            "developer prose",
            str(fixture["fixtures"]),
            pct(fixture["recall"]),
            pct(fixture["suggestion_at_1"]),
            pct(fixture["suggestion_at_3"]),
        ],
    ]
    print(markdown_table(["set", "n", "detection/recall", "@1", "@3"], rows))
    print(
        f"Clean prose: {fixture['clean_false_positives']} spelling lints in "
        f"{fixture['clean_words']} words ({fixture['clean_fp_per_1000_words']:.2f}/1k)."
    )
    for name, result in payload["birkbeck_detection"].items():
        if "error" in result:
            print(f"Birkbeck {name}: {result['error']}")
        else:
            print(f"Birkbeck {name}: {pct(result['detection'])} detection on {result['words']} words")
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
