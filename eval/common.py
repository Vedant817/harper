"""Shared helpers for the Harper quality harness.

The harness is intentionally disk-safe: every network fetch is checked against
MAX_DOWNLOAD_BYTES before the body is read, and a skipped fetch is recorded in
eval/reports/downloads.json with the reason.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path
from typing import Iterable, Sequence

ROOT = Path(__file__).resolve().parents[1]
EVAL = ROOT / "eval"
CORPORA = EVAL / "corpora"
DOWNLOADS = CORPORA / "downloads"
REPORTS = EVAL / "reports"
TMP = Path(os.environ.get("HARPER_EVAL_TMP", Path(tempfile.gettempdir()) / "harper-eval"))
MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024
USER_AGENT = "harper-quality-harness/1.0"


def ensure_dirs() -> None:
    for directory in (CORPORA, DOWNLOADS, REPORTS, TMP):
        directory.mkdir(parents=True, exist_ok=True)


def harper_cli() -> Path:
    candidates = [
        ROOT / "target" / "debug" / "harper-cli.exe",
        ROOT / "target" / "release" / "harper-cli.exe",
        ROOT / "target" / "debug" / "harper-cli",
        ROOT / "target" / "release" / "harper-cli",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise FileNotFoundError(
        "harper-cli is not built. Run `cargo build -p harper-cli` from the repository root."
    )


def _load_download_log() -> list[dict]:
    path = REPORTS / "downloads.json"
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []


def log_download(name: str, url: str, action: str, bytes: int | None = None, reason: str | None = None) -> None:
    REPORTS.mkdir(parents=True, exist_ok=True)
    entries = [entry for entry in _load_download_log() if entry.get("name") != name]
    entries.append(
        {
            "name": name,
            "url": url,
            "action": action,
            "bytes": bytes,
            "reason": reason,
            "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
    )
    (REPORTS / "downloads.json").write_text(
        json.dumps(entries, indent=2) + "\n", encoding="utf-8", newline="\n"
    )


def fetch(url: str, dest: Path, *, name: str, max_bytes: int = MAX_DOWNLOAD_BYTES) -> Path | None:
    """Download url to dest unless it is larger than max_bytes.

    The Content-Length is checked first; if the server omits it, the body is
    streamed and aborted as soon as it crosses the limit. Returns None on skip.
    """
    ensure_dirs()
    if dest.exists() and dest.stat().st_size > 0:
        log_download(name, url, "cached", dest.stat().st_size)
        return dest

    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            length_header = response.headers.get("Content-Length")
            length = int(length_header) if length_header else None
            if length is not None and length > max_bytes:
                log_download(name, url, "skipped", length, f"Content-Length {length} exceeds {max_bytes}")
                return None
            tmp = dest.with_suffix(dest.suffix + ".part")
            written = 0
            with tmp.open("wb") as handle:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    written += len(chunk)
                    if written > max_bytes:
                        handle.close()
                        tmp.unlink(missing_ok=True)
                        log_download(name, url, "skipped", written, f"body exceeded {max_bytes}")
                        return None
                    handle.write(chunk)
            tmp.replace(dest)
            log_download(name, url, "downloaded", written)
            return dest
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        log_download(name, url, "failed", None, str(error))
        return None


def extract(archive: Path, target: Path) -> Path:
    """Extract a .tar.gz/.tgz/.zip archive into target and return target."""
    target.mkdir(parents=True, exist_ok=True)
    if zipfile.is_zipfile(archive):
        with zipfile.ZipFile(archive) as zf:
            for member in zf.infolist():
                member_path = target / member.filename
                if not str(member_path.resolve()).startswith(str(target.resolve())):
                    raise RuntimeError(f"unsafe zip member: {member.filename}")
            zf.extractall(target)
        return target
    with tarfile.open(archive, "r:*") as tf:
        for member in tf.getmembers():
            member_path = target / member.name
            if not str(member_path.resolve()).startswith(str(target.resolve())):
                raise RuntimeError(f"unsafe tar member: {member.name}")
        tf.extractall(target)
    return target


def find_first(root: Path, patterns: Sequence[str]) -> Path | None:
    for pattern in patterns:
        matches = sorted(root.rglob(pattern))
        if matches:
            return matches[0]
    return None


def run(cmd: Sequence[str], *, cwd: Path | None = None, env: dict | None = None, timeout: int = 1800) -> subprocess.CompletedProcess:
    return subprocess.run(
        list(cmd),
        cwd=str(cwd or ROOT),
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
    )


def _json_payload(stdout: str) -> str:
    """Drop diagnostic chatter before the JSON document.

    Some lint paths print debug text (for example ``gerund_form: ...``) to
    stdout before the pretty-printed JSON array, so the first JSON line wins.
    """
    lines = stdout.splitlines()
    for index, line in enumerate(lines):
        stripped = line.strip()
        if stripped in ("[", "{", "[]", "{}"):
            return "\n".join(lines[index:])
    return stdout


def lint_texts(
    texts: Sequence[str],
    *,
    extra_args: Sequence[str] = (),
    workdir: Path | None = None,
    timeout: int = 1800,
) -> list[dict]:
    """Lint texts with one harper-cli invocation.

    Each text is written to its own file so the JSON result can be matched back
    by index. Returns a list of JSON lint objects with an added ``index`` field.
    """
    ensure_dirs()
    directory = workdir or (TMP / f"lint-{time.time_ns()}")
    if directory.exists():
        shutil.rmtree(directory)
    directory.mkdir(parents=True)
    for index, text in enumerate(texts):
        (directory / f"{index:06d}.txt").write_text(text, encoding="utf-8")

    cmd = [
        str(harper_cli()),
        "lint",
        str(directory),
        "--format",
        "json",
        "--no-color",
        "--dialect",
        "american",
        *extra_args,
    ]
    proc = run(cmd, timeout=timeout)
    # harper-cli exits 1 when it reports lints; both 0 and 1 carry a JSON body.
    if proc.returncode not in (0, 1):
        raise RuntimeError(f"harper-cli failed ({proc.returncode}):\n{proc.stderr[-4000:]}")
    try:
        payload = json.loads(_json_payload(proc.stdout))
    except json.JSONDecodeError as error:
        raise RuntimeError(f"harper-cli did not return JSON: {error}\nstdout={proc.stdout[:2000]!r}\nstderr={proc.stderr[-2000:]!r}") from error

    by_index: dict[int, list[dict]] = {index: [] for index in range(len(texts))}
    for file_result in payload:
        name = Path(str(file_result.get("file", ""))).stem
        try:
            index = int(name)
        except ValueError:
            continue
        for lint in file_result.get("lints", []):
            lint = dict(lint)
            lint["index"] = index
            lint["file"] = file_result.get("file")
            by_index[index].append(lint)
    return [lint for index in range(len(texts)) for lint in by_index[index]]


def _unquote(text: str) -> str:
    """Strip the matching quotes harper-cli puts around suggestion text."""
    for left, right in (("\u201c", "\u201d"), ('"', '"'), ("'", "'")):
        if len(text) >= 2 and text.startswith(left) and text.endswith(right):
            return text[1:-1]
    return text


def parse_suggestion(raw: str) -> tuple[str, str] | None:
    """Parse one harper-cli display string into an edit kind and replacement.

    harper-cli serializes ``Suggestion`` through its Display implementation, so
    JSON contains strings such as ``Replace with: \u201ca\u201d``,
    ``Insert \u201c,\u201d``, and ``Remove error`` rather than raw replacement
    text. A raw string is accepted as a replacement for forwards compatibility.
    """
    if raw is None:
        return None
    text = raw.strip()
    if text.startswith("Replace with:"):
        return ("replace", _unquote(text[len("Replace with:") :].strip()))
    if text.startswith("Insert"):
        return ("insert", _unquote(text[len("Insert") :].strip()))
    if text.lower().startswith("remove"):
        return ("remove", "")
    return ("replace", _unquote(text))


def _conflicts(start: int, end: int, taken: list[tuple[int, int]]) -> bool:
    for a, b in taken:
        if start == end:
            # An insertion conflicts only when it lands inside a replacement.
            if a < start < b:
                return True
        elif a == b:
            if start < a < end:
                return True
        elif not (end <= a or start >= b):
            return True
    return False


def apply_suggestions(text: str, lints: Iterable[dict]) -> tuple[str, list[dict]]:
    """Apply the first non-overlapping suggestion for each lint.

    Returns the corrected text and the edits that were actually applied.
    Character offsets are used because harper-cli reports character spans.
    """
    ordered = sorted(
        lints,
        key=lambda lint: (lint["span"]["char_start"], lint["span"]["char_end"]),
    )
    applied: list[dict] = []
    taken: list[tuple[int, int]] = []
    for lint in ordered:
        suggestions = lint.get("suggestions") or []
        if not suggestions:
            continue
        parsed = parse_suggestion(suggestions[0])
        if parsed is None:
            continue
        kind, replacement = parsed
        start = int(lint["span"]["char_start"])
        end = int(lint["span"]["char_end"])
        if start < 0 or end > len(text) or start > end:
            continue
        if kind == "insert":
            start = end
        elif start == end:
            # A replace/remove with an empty span cannot be applied safely.
            continue
        if _conflicts(start, end, taken):
            continue
        if kind != "insert" and replacement == text[start:end]:
            continue
        applied.append(
            {
                "start": start,
                "end": end,
                "replacement": replacement,
                "kind": kind,
                "rule": lint.get("rule"),
            }
        )
        taken.append((start, end))

    if not applied:
        return text, []
    pieces: list[str] = []
    cursor = 0
    for edit in sorted(applied, key=lambda item: (item["start"], item["end"])):
        pieces.append(text[cursor : edit["start"]])
        pieces.append(edit["replacement"])
        cursor = edit["end"]
    pieces.append(text[cursor:])
    return "".join(pieces), applied


def word_count(text: str) -> int:
    return len(re.findall(r"[A-Za-z0-9']+", text))


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def pct(value: float) -> str:
    return f"{value * 100:.2f}%"


def f05(precision: float, recall: float) -> float:
    if precision <= 0 or recall <= 0:
        return 0.0
    beta2 = 0.25
    return (1 + beta2) * precision * recall / (beta2 * precision + recall)


def markdown_table(headers: Sequence[str], rows: Sequence[Sequence[str]]) -> str:
    widths = [len(header) for header in headers]
    for row in rows:
        for index, cell in enumerate(row):
            widths[index] = max(widths[index], len(str(cell)))
    lines = ["| " + " | ".join(header.ljust(widths[i]) for i, header in enumerate(headers)) + " |"]
    lines.append("| " + " | ".join("-" * widths[i] for i in range(len(headers))) + " |")
    for row in rows:
        lines.append("| " + " | ".join(str(cell).ljust(widths[i]) for i, cell in enumerate(row)) + " |")
    return "\n".join(lines)


def git_commit() -> str:
    try:
        return run(["git", "rev-parse", "--short", "HEAD"]).stdout.strip()
    except Exception:
        return "unknown"
