# Harper evaluation report

- Generated: 2026-11-21T08:40:20Z
- Engine commit: `08ffa17d`
- Extension results include the local shadow-root fixes on top of that commit.
- Scope: spelling, grammar, punctuation, and usage only.
- This is an evaluation harness, not a claim of Grammarly Premium parity.

## Personal acceptance cases

| case                 | preset | result | reason                                                 |
| -------------------- | ------ | ------ | ------------------------------------------------------ |
| comma-splice         | casual | FAIL   | expected PersonalCommaSplice -> ". "                   |
| direct-question      | casual | FAIL   | expected PersonalDirectQuestion -> "?"                 |
| greeting-comma       | casual | PASS   |                                                        |
| object-case          | casual | PASS   |                                                        |
| less-fewer           | casual | PASS   |                                                        |
| due-to-fact          | casual | PASS   |                                                        |
| in-order-to          | casual | FAIL   | expected a suggestion containing "to"                  |
| at-this-point        | casual | PASS   |                                                        |
| in-the-event         | casual | PASS   |                                                        |
| could-care-less      | casual | FAIL   | expected PersonalCouldCareLess -> "couldn't care less" |
| irregardless         | casual | PASS   |                                                        |
| urgent-marks         | core   | FAIL   | expected a suggestion containing "urgent!"             |
| what-marks           | core   | FAIL   | expected a suggestion containing "What?"               |
| an-test              | core   | PASS   |                                                        |
| could-of             | core   | PASS   |                                                        |
| hope-well            | email  | PASS   |                                                        |
| wanted-follow-up     | email  | PASS   |                                                        |
| per-last-email       | email  | PASS   |                                                        |
| circling-back        | email  | PASS   |                                                        |
| reach-out            | email  | PASS   |                                                        |
| greeting-ok          | casual | PASS   |                                                        |
| sounds-good          | casual | PASS   |                                                        |
| wait-for-it          | casual | PASS   |                                                        |
| suspect              | casual | PASS   |                                                        |
| imagine              | casual | PASS   |                                                        |
| never-due            | casual | PASS   |                                                        |
| seems-due            | casual | PASS   |                                                        |
| care-less-comparison | casual | PASS   |                                                        |
| reach-out-mile       | email  | PASS   |                                                        |
| about-hour           | email  | PASS   |                                                        |
| stock-off            | casual | PASS   |                                                        |

**25/31 passed.** A failure here means the browser build does not meet the stated personal contract.

## Public GEC corpora (ERRANT, token-level)

| corpus     | n    | P      | R      | F0.5   | gold FP/1k | LanguageTool |
| ---------- | ---- | ------ | ------ | ------ | ---------- | ------------ |
| cweb-s-dev | 2862 | 5.93%  | 8.80%  | 6.35%  | 28.66      | n/a          |
| cweb-g-dev | 3867 | 10.04% | 10.71% | 10.17% | 26.29      | n/a          |
| gmeg-wiki  | 992  | 18.76% | 11.77% | 16.77% | 42.49      | n/a          |
| gmeg-fce   | 968  | 36.15% | 7.38%  | 20.32% | 12.16      | n/a          |
| conll2014  | 1312 | 56.65% | 7.20%  | 23.87% | 18.75      | n/a          |
| bea19      | 4384 | 27.77% | 8.87%  | 19.47% | 29.63      | n/a          |

LanguageTool: No local LanguageTool command found. The 252 MB LanguageTool-stable.zip was not downloaded.

Method: first non-overlapping suggestion per lint, applied at token granularity; ERRANT annotates source against Harper output; matching requires the same token span and correction tokens. `gold FP/1k` lints the detokenized reference text and reports Harper lints per 1,000 words.

## Spelling and developer writing

| set             | n   | detection/recall | @1     | @3     |
| --------------- | --- | ---------------- | ------ | ------ |
| word-level      | 300 | 96.00%           | 72.67% | 85.00% |
| developer prose | 60  | 85.00%           | 75.00% | 78.33% |

Developer prose fixtures: 4 substituted, 56 injected; precision 83.61%.

Clean prose false positives: 23 spelling lints in 2345 words (9.81 per 1k).

| Birkbeck list | sample | detection | detected |
| ------------- | ------ | --------- | -------- |
| missp         | 200    | 84.50%    | 169      |
| holbrook      | 200    | 58.00%    | 116      |
| aspell        | 200    | 91.50%    | 183      |
| wikipedia     | 200    | 93.50%    | 187      |

Sources: codespell (64966 pairs), wikipedia (4276 pairs), typos-cli (95923 pairs).

## Extension acceptance (Playwright, headed Chromium)

| gate                       | observed          | limit | result |
| -------------------------- | ----------------- | ----- | ------ |
| paste underline <= 700 ms  | 12                | 700   | PASS   |
| full draft tail underlined | True              | True  | PASS   |
| highlight in shadow root   | True              | True  | PASS   |
| shadow-root editor linted  | True              | True  | PASS   |
| card width <= 280 px       | 266.1011276245117 | 280.5 | PASS   |
| card opens <= 300 ms       | 21                | 300   | PASS   |
| no dialog calls            | []                | []    | PASS   |
| no open dialog elements    | 0                 | 0     | PASS   |

**All gates passed.**

## Commands

```
cargo build -p harper-cli
eval\.venv\Scripts\python.exe eval\run_personal.py
eval\.venv\Scripts\python.exe eval\run_gec.py
eval\.venv\Scripts\python.exe eval\run_spelling.py
python eval\run_extension.py
python eval\report.py
```

## Downloads

| name                        | action     | bytes   | reason |
| --------------------------- | ---------- | ------- | ------ |
| conll2014                   | downloaded | 643482  |        |
| conll2013                   | downloaded | 1096955 |        |
| bea19                       | downloaded | 6120469 |        |
| fce                         | downloaded | 2774021 |        |
| cweb                        | downloaded | 6286922 |        |
| gmeg                        | downloaded | 2645332 |        |
| jfleg                       | downloaded | 799068  |        |
| tetra                       | downloaded | 497864  |        |
| spelling-codespell          | cached     | 1499566 |        |
| spelling-wikipedia          | cached     | 99150   |        |
| spelling-typos              | cached     | 2069776 |        |
| spelling-birkbeck-missp     | cached     | 368933  |        |
| spelling-birkbeck-holbrook  | cached     | 24597   |        |
| spelling-birkbeck-aspell    | cached     | 9326    |        |
| spelling-birkbeck-wikipedia | cached     | 43848   |        |

Intentional skips:

- **LanguageTool-stable.zip** (252 MB): No local install found. The harness never downloads LanguageTool; the zip is over the 50 MB guard.
- **LanguageTool English n-grams** (8.96 GB): Not downloaded, by instruction.
- **crate-ci/typos repository** (~105 MB (GitHub API)): Repository exceeds the 50 MB guard. The smaller typos-dict words.csv is used instead.
- **vale-cli/vale repository** (~80 MB (GitHub API)): Repository exceeds the 50 MB guard and is not needed for these checks.
- **codespell-project/codespell repository** (~30 MB (GitHub API)): Not cloned; the raw dictionary.txt is downloaded instead.
