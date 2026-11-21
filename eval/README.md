# Harper quality evaluation harness

This harness judges whether the local Harper build can replace Grammarly Premium
for **spelling, grammar, punctuation, and usage only**. It does not measure tone,
clarity, or rewriting quality, and it never claims Premium parity.

The latest combined report is [`reports/latest.md`](reports/latest.md).

## Layout

```
eval/
├── common.py           # fetch guard, harper-cli JSON runner, suggestion parsing
├── fetch_corpora.py    # public GEC corpora with a 50 MB per-download guard
├── run_personal.py     # personal acceptance cases against the browser build
├── run_gec.py          # ERRANT P/R/F0.5 on public GEC corpora
├── run_spelling.py     # word-level, developer-prose, Birkbeck, clean-text checks
├── run_extension.py    # Playwright acceptance gates for the extension
├── run_all.py          # run everything and regenerate latest.md
├── report.py           # aggregate reports into latest.md
├── personal/cases.json # the stated personal acceptance contract
└── reports/            # generated JSON and Markdown reports
```

Ignored locally: `.venv/`, `corpora/`, `__pycache__/`, and per-metric files under
`reports/extension/`.

## Setup

```powershell
# Engine used by the corpus and spelling benchmarks.
cargo build -p harper-cli

# ERRANT for GEC scoring (Python 3.14 works in this checkout).
python -m venv eval\.venv
eval\.venv\Scripts\python.exe -m pip install errant
eval\.venv\Scripts\python.exe -m spacy download en_core_web_sm

# Public corpora (all individual downloads stay under 50 MB).
eval\.venv\Scripts\python.exe eval\fetch_corpora.py
```

The extension gates need a built extension:

```powershell
cd packages\chrome-plugin
$env:TARGET_BROWSER = 'chrome'
pnpm build
```

## Running

```powershell
# Everything (personal, GEC, spelling, extension), then the report.
eval\.venv\Scripts\python.exe eval\run_all.py

# Or individually.
python eval\run_personal.py
eval\.venv\Scripts\python.exe eval\run_gec.py
eval\.venv\Scripts\python.exe eval\run_spelling.py
python eval\run_extension.py
python eval\report.py
```

`run_gec.py --limit 200` is a fast smoke run. `run_all.py --skip-extension`
omits Playwright.

### Personal acceptance cases

The personal rules are browser-side Weir packs in
`packages/chrome-plugin/src/personalWeir.ts`, not core Rust rules. The cases run
through `packages/harper.js/src/personalCases.test.ts` with `LocalLinter`, the
real preset packs, and the inlined WASM binary. The test is gated so the normal
suite stays green:

```powershell
$env:HARPER_PERSONAL_EVAL = '1'
cd packages\harper.js
pnpm exec vitest run src/personalCases.test.ts --browser.enabled=false
```

A failing case is a product gap, not a harness bug. Do not relax the case to
make the run pass.

### GEC scoring

`run_gec.py` applies the first non-overlapping suggestion per lint at **token**
granularity, runs ERRANT between the source and Harper's output, and matches
edits by token span plus correction tokens. Token matching is required because
CoNLL, BEA, and GMEG inputs are pre-tokenized with spaces before punctuation;
character matching would score whitespace normalization as grammar edits.

Reports precision, recall, and F0.5 (beta = 0.5), plus `gold FP/1k`: Harper lints
on the detokenized reference text per 1,000 words. LanguageTool is only run when
a local command already exists; the harness never downloads it.

### Spelling

`run_spelling.py` uses codespell, the Wikipedia machine-misspelling list, and
typos-cli as typo/correction sources, plus the Birkbeck lists for detection.
It reports:

- detection and suggestion@1/@3 on synthetic word-level fixtures,
- recall/precision and suggestion@1/@3 on typos seeded into developer comments,
- spelling false positives on clean documentation prose,
- detection on random samples from the four Birkbeck lists.

### Extension gates

`run_extension.py` runs headed Chromium because Chromium extensions cannot load
headless. Gates: paste underline <= 700 ms, full draft linted, highlights in a
shadow root, an editor inside an open shadow root, card width <= 280 px, card
opens <= 300 ms, and no dialog/alert/confirm/prompt on paste.

## Download safety

`common.fetch` checks `Content-Length` before reading and aborts a streamed body
that crosses 50 MB. Every download, skip, and failure is recorded in
`reports/downloads.json`. Intentionally skipped:

- LanguageTool-stable.zip (252 MB) and its English n-grams (8.96 GB);
- the typos (~105 MB) and Vale (~80 MB) repositories;
- the codespell repository (the raw dictionary file is used instead).

## Interpreting results

`reports/latest.md` is the human-readable summary. The JSON files keep the
per-case, per-corpus, and per-gate detail. A red personal case or extension gate
means this build does not meet the stated acceptance contract; it is not a
reason to weaken the test.
