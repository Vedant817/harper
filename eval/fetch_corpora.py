#!/usr/bin/env python3
"""Fetch the public evaluation corpora, with a hard 50 MB per-download guard.

Nothing here is required to build Harper. The data lives under eval/corpora and
is ignored by git. Run `python eval/fetch_corpora.py` to fetch everything that
is small enough, or name one corpus, e.g. `... fetch_corpora.py cweb`.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

from common import CORPORA, DOWNLOADS, fetch, extract, log_download, markdown_table

TARBALLS = {
    "conll2014": (
        "https://www.comp.nus.edu.sg/~nlp/conll14st/conll14st-test-data.tar.gz",
        "conll14st-test-data.tar.gz",
    ),
    "conll2013": (
        "https://www.comp.nus.edu.sg/~nlp/conll13st/release2.3.1.tar.gz",
        "release2.3.1.tar.gz",
    ),
    "bea19": (
        "https://www.cl.cam.ac.uk/research/nl/bea2019st/data/wi+locness_v2.1.bea19.tar.gz",
        "wi+locness_v2.1.bea19.tar.gz",
    ),
    "fce": (
        "https://www.cl.cam.ac.uk/research/nl/bea2019st/data/fce_v2.1.bea19.tar.gz",
        "fce_v2.1.bea19.tar.gz",
    ),
}

GITHUB = {
    "cweb": ("SimonHFL", "CWEB"),
    "gmeg": ("grammarly", "gmeg"),
    "jfleg": ("keisks", "jfleg"),
    "tetra": ("chemicaltree", "tetra"),
}

OPTIONAL_GITHUB = {
    "codespell": ("codespell-project", "codespell"),
    "typos": ("crate-ci", "typos"),
    "vale": ("vale-cli", "vale"),
}


def github_zip(name: str, owner: str, repo: str) -> Path | None:
    target = CORPORA / name
    marker = target / ".fetched"
    if marker.exists():
        log_download(name, f"github:{owner}/{repo}", "cached")
        return target

    api_url = f"https://api.github.com/repos/{owner}/{repo}"
    import urllib.request

    try:
        with urllib.request.urlopen(
            urllib.request.Request(api_url, headers={"User-Agent": "harper-quality-harness/1.0"}),
            timeout=30,
        ) as response:
            metadata = json.load(response)
        branch = metadata.get("default_branch", "master")
        size_kb = int(metadata.get("size", 0))
    except Exception as error:  # noqa: BLE001 - network failures are reported, not raised
        log_download(name, api_url, "failed", None, f"metadata: {error}")
        return None

    # GitHub's size is in KB and is only an estimate, but it is enough to stop
    # an obviously oversized checkout before downloading it.
    if size_kb * 1024 > 50 * 1024 * 1024:
        log_download(name, api_url, "skipped", size_kb * 1024, "repository metadata exceeds 50 MB")
        return None

    url = f"https://codeload.github.com/{owner}/{repo}/zip/refs/heads/{branch}"
    archive = fetch(url, DOWNLOADS / f"{name}.zip", name=name)
    if archive is None:
        return None
    if target.exists():
        shutil.rmtree(target)
    extract(archive, target)
    marker.write_text(url + "\n", encoding="utf-8")
    return target


def fetch_tarball(name: str) -> Path | None:
    target = CORPORA / name
    marker = target / ".fetched"
    if marker.exists():
        log_download(name, TARBALLS[name][0], "cached")
        return target
    url, filename = TARBALLS[name]
    archive = fetch(url, DOWNLOADS / filename, name=name)
    if archive is None:
        return None
    if target.exists():
        shutil.rmtree(target)
    extract(archive, target)
    marker.write_text(url + "\n", encoding="utf-8")
    return target


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("names", nargs="*", help="corpus names (default: all core corpora)")
    parser.add_argument("--optional", action="store_true", help="also fetch optional tooling sources")
    args = parser.parse_args(argv)

    requested = args.names or list(TARBALLS) + list(GITHUB)
    rows = []
    for name in requested:
        if name in TARBALLS:
            result = fetch_tarball(name)
        elif name in GITHUB:
            result = github_zip(name, *GITHUB[name])
        elif name in OPTIONAL_GITHUB:
            result = github_zip(name, *OPTIONAL_GITHUB[name])
        else:
            print(f"unknown corpus: {name}", file=sys.stderr)
            continue
        rows.append([name, "ready" if result else "skipped/failed", str(result or "")])

    if args.optional:
        for name, (owner, repo) in OPTIONAL_GITHUB.items():
            result = github_zip(name, owner, repo)
            rows.append([name, "ready" if result else "skipped/failed", str(result or "")])

    print(markdown_table(["corpus", "result", "path"], rows))
    print("\nSkipped or failed downloads are recorded in eval/reports/downloads.json.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
