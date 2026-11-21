# Harper evaluation report

- Generated: 2026-11-21T13:47:32Z
- Engine commit: `e0c2101d`
- Extension results include the local shadow-root fixes on top of that commit.
- Scope: spelling, grammar, punctuation, and usage only.
- This is an evaluation harness, not a claim of Grammarly Premium parity.

## Personal acceptance cases

| case                 | preset | result | reason                                     |
| -------------------- | ------ | ------ | ------------------------------------------ |
| comma-splice         | casual | PASS   |                                            |
| direct-question      | casual | FAIL   | expected PersonalDirectQuestion -> "?"     |
| greeting-comma       | casual | PASS   |                                            |
| object-case          | casual | PASS   |                                            |
| less-fewer           | casual | PASS   |                                            |
| due-to-fact          | casual | PASS   |                                            |
| in-order-to          | casual | PASS   |                                            |
| at-this-point        | casual | PASS   |                                            |
| in-the-event         | casual | PASS   |                                            |
| could-care-less      | casual | PASS   |                                            |
| irregardless         | casual | PASS   |                                            |
| urgent-marks         | core   | FAIL   | expected a suggestion containing "urgent!" |
| what-marks           | core   | FAIL   | expected a suggestion containing "What?"   |
| an-test              | core   | PASS   |                                            |
| could-of             | core   | PASS   |                                            |
| hope-well            | email  | PASS   |                                            |
| wanted-follow-up     | email  | PASS   |                                            |
| per-last-email       | email  | PASS   |                                            |
| circling-back        | email  | PASS   |                                            |
| reach-out            | email  | PASS   |                                            |
| greeting-ok          | casual | PASS   |                                            |
| sounds-good          | casual | PASS   |                                            |
| wait-for-it          | casual | PASS   |                                            |
| suspect              | casual | PASS   |                                            |
| imagine              | casual | PASS   |                                            |
| never-due            | casual | PASS   |                                            |
| seems-due            | casual | PASS   |                                            |
| care-less-comparison | casual | PASS   |                                            |
| reach-out-mile       | email  | PASS   |                                            |
| about-hour           | email  | PASS   |                                            |
| stock-off            | casual | PASS   |                                            |

**28/31 passed.** A failure here means the browser build does not meet the stated personal contract.

## Follow-up changes

| item                 | evidence before                               | change                                                               | result after                                                                                                                     | acceptance         | status           |
| -------------------- | --------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------- |
| 0 baseline           | personal 25/31; BEA 27.77/8.87/19.47          | recorded in this report                                              | same baseline                                                                                                                    | n/a                | PASS             |
| 1a determinism       | BEA varied 27.77 vs 27.82 between runs        | eval/common.py sort; eval/run_gec.py canonicalizes RegularIrregulars | two full runs identical                                                                                                          | run_gec.py twice   | PASS             |
| 1b card limit        | limit 280.5                                   | eval/run_extension.py and personal_acceptance.spec.ts use 280        | limit 280; card 266.1                                                                                                            | run_extension.py   | PASS             |
| 1c diagnostics       | no per-type or per-rule FP detail             | eval/run_gec.py, run_spelling.py, report.py add the tables           | per-type, top-10 FP rules with examples, all clean lints                                                                         | report.py          | PASS             |
| 1d scope             | unknown whether GEC loads personal packs      | no code change                                                       | GEC loads the curated Rust config only                                                                                           | report scope check | PASS             |
| 2 false positives    | CWEB-S 5.93%, CWEB-G 10.04%, GMEG wiki 18.76% | diagnosis only; no fix                                               | SpellCheck dominates; style rules next                                                                                           | none               | PASS (diagnosis) |
| 3a comma splice      | case FAIL                                     | personalWeir.ts accepts AUX tails                                    | case PASS                                                                                                                        | run_personal.py    | PASS             |
| 3b direct question   | case FAIL                                     | stopped: no Weir end anchor or insert suggestion                     | case FAIL                                                                                                                        | run_personal.py    | STOPPED          |
| 3c could care less   | case FAIL                                     | personalWeir.ts matches the bare phrase before a period              | case PASS                                                                                                                        | run_personal.py    | PASS             |
| 3d in order to       | case FAIL                                     | personalWeir.ts adds PersonalInOrderTo to the casual pack            | case PASS                                                                                                                        | run_personal.py    | PASS             |
| 3e/3f stacked marks  | cases FAIL                                    | stopped: Weir cannot match stacked ! or ?; core preset loads no pack | cases FAIL                                                                                                                       | run_personal.py    | STOPPED          |
| 4 extension coverage | fixtures only for textarea/shadow             | LinkedIn dialog and pre-filled Gmail fixtures + gates                | LinkedIn 10 ms; Gmail 208 ms; 8/8 gates                                                                                          | run_extension.py   | PASS             |
| 5 LanguageTool       | not installed                                 | skipped by ALLOW_LT_DOWNLOAD=no                                      | not measured                                                                                                                     | none               | SKIPPED          |
| 6 regressions        | not reported last time                        | just unavailable; ran the fallback commands explicitly               | test_pos_tagger pass; test_most_lints pass (linters target); pnpm check 0 errors; tsc pass; full crate skipped (no Rust changes) | step 6 commands    | PASS             |

### Personal cases: 25/31 before, 28/31 after

Fixed: comma splice, bare could care less, and in order to. Stopped: direct question (no Weir end anchor; `becomes` only emits ReplaceWith), urgent!!! and What??? (Weir treats `!` as the Not operator and `?` as a chunk terminator; the cases also use the core preset, which loads no personal pack).

### Stopped items

- 3b needs an end-of-input anchor or an insertion suggestion in Weir, or a core Rust linter. Both are outside the personalWeir-only scope.
- 3e/3f need a repeated-punctuation linter in harper-core and a default-config entry, or a Weir escape for stacked marks. Neither exists, and the core preset does not load personal packs.

### Extension suite

The full chrome-plugin suite ran with playwright.eval.config.ts on Windows: 69 passed, 12 failed, 2 skipped. The failures are css_zoom, github (2), hn, nested_elements, personal_polish, simple_textarea wrap, and typst (5). None are the shadow-root or new composer gates; they use the Windows config without the repo's Linux vglrun/GPU wrapper.

### Still not measured

ErAConD, FCE and CoNLL-2013 scoring, JFLEG, TETRA, LanguageTool rule tests, `just dogfood`, and tone/clarity. These are left for a later round.

### Follow-up commits

- `9ee70eda` fix(eval): make GEC scoring deterministic
- `e0c2101d` fix(eval): enforce the 280 px card limit exactly
- `450c0474` feat(eval): add GEC and spelling diagnostics
- `369ca4bf` fix(personal-weir): accept modal tails in comma splices
- `f8be1da6` fix(personal-weir): match bare could care less
- `a814991d` fix(personal-weir): shorten in order to
- `f7a84153` test(chrome-plugin): cover LinkedIn and Gmail-like composers
- this report commit

## Public GEC corpora (ERRANT, token-level)

| corpus     | n    | P      | R      | F0.5   | gold FP/1k | LanguageTool |
| ---------- | ---- | ------ | ------ | ------ | ---------- | ------------ |
| cweb-s-dev | 2862 | 5.93%  | 8.80%  | 6.35%  | 28.66      | n/a          |
| cweb-g-dev | 3867 | 10.04% | 10.71% | 10.17% | 26.29      | n/a          |
| gmeg-wiki  | 992  | 18.76% | 11.77% | 16.77% | 42.49      | n/a          |
| gmeg-fce   | 968  | 36.15% | 7.38%  | 20.32% | 12.16      | n/a          |
| conll2014  | 1312 | 56.65% | 7.20%  | 23.87% | 18.75      | n/a          |
| bea19      | 4384 | 27.77% | 8.87%  | 19.47% | 29.63      | n/a          |

LanguageTool: not measured — No local LanguageTool command found. The 252 MB LanguageTool-stable.zip was not downloaded.

Method: first non-overlapping suggestion per lint, applied at token granularity; ERRANT annotates source against Harper output; matching requires the same token span and correction tokens. `gold FP/1k` lints the detokenized reference text and reports Harper lints per 1,000 words.

Scope check: `run_gec.py` calls `harper-cli lint` with the curated Rust config. It does not load `packages/chrome-plugin/src/personalWeir.ts`; personal Weir rules are measured only by `run_personal.py`.

### Per-type P/R/F0.5

| corpus     | type         | gold | pred | match | P       | R       | F0.5    |
| ---------- | ------------ | ---- | ---- | ----- | ------- | ------- | ------- |
| cweb-s-dev | U:PREP       | 11   | 11   | 7     | 63.64%  | 63.64%  | 63.64%  |
| cweb-s-dev | M:VERB:FORM  | 1    | 2    | 1     | 50.00%  | 100.00% | 55.56%  |
| cweb-s-dev | U:DET        | 32   | 8    | 7     | 87.50%  | 21.88%  | 54.69%  |
| cweb-s-dev | U:ADV        | 2    | 2    | 1     | 50.00%  | 50.00%  | 50.00%  |
| cweb-s-dev | M:PUNCT      | 241  | 73   | 44    | 60.27%  | 18.26%  | 41.28%  |
| cweb-s-dev | R:NOUN:INFL  | 1    | 5    | 1     | 20.00%  | 100.00% | 23.81%  |
| cweb-s-dev | R:VERB:SVA   | 21   | 2    | 1     | 50.00%  | 4.76%   | 17.24%  |
| cweb-s-dev | R:DET        | 18   | 3    | 1     | 33.33%  | 5.56%   | 16.67%  |
| cweb-s-dev | M:DET        | 59   | 2    | 2     | 100.00% | 3.39%   | 14.93%  |
| cweb-s-dev | U:PUNCT      | 95   | 31   | 6     | 19.35%  | 6.32%   | 13.70%  |
| cweb-s-dev | R:VERB:TENSE | 21   | 5    | 1     | 20.00%  | 4.76%   | 12.20%  |
| cweb-s-dev | R:ORTH       | 42   | 150  | 10    | 6.67%   | 23.81%  | 7.79%   |
| cweb-s-dev | R:OTHER      | 94   | 95   | 3     | 3.16%   | 3.19%   | 3.16%   |
| cweb-s-dev | R:SPELL      | 20   | 841  | 7     | 0.83%   | 35.00%  | 1.03%   |
| cweb-s-dev | R:NOUN       | 32   | 218  | 1     | 0.46%   | 3.12%   | 0.55%   |
| cweb-s-dev | M:ADJ        | 3    | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-s-dev | M:ADV        | 4    | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-s-dev | M:CONJ       | 5    | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-s-dev | M:NOUN       | 14   | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-s-dev | M:NOUN:POSS  | 6    | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-s-dev | M:OTHER      | 24   | 3    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-s-dev | M:PART       | 1    | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-s-dev | M:PREP       | 45   | 0    | 1     | 0.00%   | 2.22%   | 0.00%   |
| cweb-s-dev | M:PRON       | 2    | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-s-dev | M:VERB       | 15   | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-s-dev | M:VERB:TENSE | 7    | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-s-dev | R:ADJ        | 3    | 11   | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-s-dev | R:ADV        | 6    | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-s-dev | R:CONJ       | 2    | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-s-dev | R:MORPH      | 17   | 35   | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-s-dev | R:NOUN:NUM   | 55   | 6    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-s-dev | R:PART       | 11   | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-s-dev | R:PREP       | 69   | 1    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-s-dev | R:PRON       | 4    | 2    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-s-dev | R:PUNCT      | 12   | 73   | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-s-dev | R:VERB       | 21   | 2    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-s-dev | R:VERB:FORM  | 21   | 4    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-s-dev | R:WO         | 13   | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-s-dev | U:CONJ       | 1    | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-s-dev | U:NOUN       | 5    | 9    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-s-dev | U:OTHER      | 9    | 4    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-s-dev | U:PRON       | 2    | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-s-dev | U:VERB       | 5    | 0    | 1     | 0.00%   | 20.00%  | 0.00%   |
| cweb-s-dev | U:VERB:FORM  | 1    | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-s-dev | U:VERB:TENSE | 6    | 1    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-g-dev | U:PART       | 2    | 1    | 1     | 100.00% | 50.00%  | 83.33%  |
| cweb-g-dev | M:PREP       | 29   | 3    | 6     | 200.00% | 20.69%  | 73.17%  |
| cweb-g-dev | U:DET        | 72   | 15   | 14    | 93.33%  | 19.44%  | 53.03%  |
| cweb-g-dev | U:ADV        | 17   | 3    | 3     | 100.00% | 17.65%  | 51.72%  |
| cweb-g-dev | M:VERB:FORM  | 4    | 2    | 1     | 50.00%  | 25.00%  | 41.67%  |
| cweb-g-dev | R:DET        | 37   | 9    | 6     | 66.67%  | 16.22%  | 41.10%  |
| cweb-g-dev | U:PREP       | 21   | 13   | 6     | 46.15%  | 28.57%  | 41.10%  |
| cweb-g-dev | M:PUNCT      | 261  | 115  | 51    | 44.35%  | 19.54%  | 35.37%  |
| cweb-g-dev | R:NOUN:INFL  | 2    | 4    | 1     | 25.00%  | 50.00%  | 27.78%  |
| cweb-g-dev | R:ORTH       | 127  | 203  | 40    | 19.70%  | 31.50%  | 21.30%  |
| cweb-g-dev | R:NOUN:NUM   | 76   | 10   | 4     | 40.00%  | 5.26%   | 17.24%  |
| cweb-g-dev | U:PUNCT      | 85   | 15   | 5     | 33.33%  | 5.88%   | 17.24%  |
| cweb-g-dev | R:ADJ        | 16   | 12   | 2     | 16.67%  | 12.50%  | 15.62%  |
| cweb-g-dev | R:VERB:FORM  | 35   | 1    | 1     | 100.00% | 2.86%   | 12.82%  |
| cweb-g-dev | R:PREP       | 88   | 4    | 2     | 50.00%  | 2.27%   | 9.62%   |
| cweb-g-dev | R:VERB:TENSE | 47   | 2    | 1     | 50.00%  | 2.13%   | 9.09%   |
| cweb-g-dev | R:MORPH      | 30   | 54   | 4     | 7.41%   | 13.33%  | 8.13%   |
| cweb-g-dev | R:VERB       | 47   | 10   | 1     | 10.00%  | 2.13%   | 5.75%   |
| cweb-g-dev | R:OTHER      | 168  | 106  | 6     | 5.66%   | 3.57%   | 5.07%   |
| cweb-g-dev | R:NOUN       | 53   | 220  | 6     | 2.73%   | 11.32%  | 3.22%   |
| cweb-g-dev | R:SPELL      | 43   | 910  | 19    | 2.09%   | 44.19%  | 2.58%   |
| cweb-g-dev | M:ADJ        | 5    | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-g-dev | M:ADV        | 11   | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-g-dev | M:CONJ       | 12   | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-g-dev | M:DET        | 91   | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-g-dev | M:NOUN       | 10   | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-g-dev | M:NOUN:POSS  | 2    | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-g-dev | M:OTHER      | 31   | 1    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-g-dev | M:PRON       | 11   | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-g-dev | M:VERB       | 24   | 1    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-g-dev | M:VERB:TENSE | 10   | 1    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-g-dev | R:ADJ:FORM   | 1    | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-g-dev | R:ADV        | 16   | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-g-dev | R:CONJ       | 5    | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-g-dev | R:PART       | 16   | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-g-dev | R:PRON       | 14   | 1    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-g-dev | R:PUNCT      | 52   | 72   | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-g-dev | R:VERB:INFL  | 1    | 0    | 1     | 0.00%   | 100.00% | 0.00%   |
| cweb-g-dev | R:VERB:SVA   | 23   | 3    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-g-dev | R:WO         | 31   | 1    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-g-dev | U:ADJ        | 2    | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-g-dev | U:CONJ       | 3    | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-g-dev | U:NOUN       | 7    | 8    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-g-dev | U:OTHER      | 21   | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-g-dev | U:PRON       | 3    | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-g-dev | U:VERB       | 10   | 1    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-g-dev | U:VERB:FORM  | 3    | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| cweb-g-dev | U:VERB:TENSE | 15   | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| gmeg-wiki  | R:VERB:INFL  | 4    | 4    | 4     | 100.00% | 100.00% | 100.00% |
| gmeg-wiki  | R:MORPH      | 49   | 25   | 18    | 72.00%  | 36.73%  | 60.40%  |
| gmeg-wiki  | U:VERB:TENSE | 14   | 3    | 3     | 100.00% | 21.43%  | 57.69%  |
| gmeg-wiki  | R:DET        | 32   | 14   | 10    | 71.43%  | 31.25%  | 56.82%  |
| gmeg-wiki  | U:PREP       | 32   | 6    | 6     | 100.00% | 18.75%  | 53.57%  |
| gmeg-wiki  | U:DET        | 38   | 7    | 7     | 100.00% | 18.42%  | 53.03%  |
| gmeg-wiki  | R:PRON       | 12   | 2    | 2     | 100.00% | 16.67%  | 50.00%  |
| gmeg-wiki  | R:VERB:FORM  | 26   | 8    | 4     | 50.00%  | 15.38%  | 34.48%  |
| gmeg-wiki  | U:PUNCT      | 114  | 10   | 9     | 90.00%  | 7.89%   | 29.22%  |
| gmeg-wiki  | R:ORTH       | 199  | 101  | 31    | 30.69%  | 15.58%  | 25.70%  |
| gmeg-wiki  | U:ADV        | 12   | 2    | 1     | 50.00%  | 8.33%   | 25.00%  |
| gmeg-wiki  | M:PREP       | 40   | 2    | 2     | 100.00% | 5.00%   | 20.83%  |
| gmeg-wiki  | R:VERB       | 27   | 6    | 2     | 33.33%  | 7.41%   | 19.61%  |
| gmeg-wiki  | M:PUNCT      | 566  | 26   | 26    | 100.00% | 4.59%   | 19.40%  |
| gmeg-wiki  | R:SPELL      | 199  | 843  | 106   | 12.57%  | 53.27%  | 14.84%  |
| gmeg-wiki  | R:ADJ        | 8    | 8    | 1     | 12.50%  | 12.50%  | 12.50%  |
| gmeg-wiki  | R:NOUN       | 60   | 159  | 17    | 10.69%  | 28.33%  | 12.21%  |
| gmeg-wiki  | R:VERB:SVA   | 34   | 4    | 1     | 25.00%  | 2.94%   | 10.00%  |
| gmeg-wiki  | R:OTHER      | 169  | 42   | 5     | 11.90%  | 2.96%   | 7.42%   |
| gmeg-wiki  | U:NOUN       | 24   | 11   | 1     | 9.09%   | 4.17%   | 7.35%   |
| gmeg-wiki  | M:DET        | 71   | 1    | 1     | 100.00% | 1.41%   | 6.67%   |
| gmeg-wiki  | M:ADV        | 7    | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| gmeg-wiki  | M:CONJ       | 11   | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| gmeg-wiki  | M:NOUN       | 9    | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| gmeg-wiki  | M:NOUN:POSS  | 1    | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| gmeg-wiki  | M:OTHER      | 28   | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| gmeg-wiki  | M:PART       | 2    | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| gmeg-wiki  | M:PRON       | 7    | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| gmeg-wiki  | M:VERB       | 15   | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| gmeg-wiki  | M:VERB:FORM  | 2    | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| gmeg-wiki  | M:VERB:TENSE | 3    | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| gmeg-wiki  | R:ADJ:FORM   | 1    | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| gmeg-wiki  | R:ADV        | 12   | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| gmeg-wiki  | R:CONJ       | 5    | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| gmeg-wiki  | R:NOUN:NUM   | 33   | 2    | 0     | 0.00%   | 0.00%   | 0.00%   |
| gmeg-wiki  | R:NOUN:POSS  | 1    | 53   | 0     | 0.00%   | 0.00%   | 0.00%   |
| gmeg-wiki  | R:PART       | 2    | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| gmeg-wiki  | R:PREP       | 65   | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| gmeg-wiki  | R:PUNCT      | 80   | 13   | 0     | 0.00%   | 0.00%   | 0.00%   |
| gmeg-wiki  | R:VERB:TENSE | 28   | 6    | 0     | 0.00%   | 0.00%   | 0.00%   |
| gmeg-wiki  | R:WO         | 62   | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| gmeg-wiki  | U:ADJ        | 5    | 1    | 0     | 0.00%   | 0.00%   | 0.00%   |
| gmeg-wiki  | U:CONJ       | 13   | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| gmeg-wiki  | U:NOUN:POSS  | 2    | 0    | 0     | 0.00%   | 0.00%   | 0.00%   |
| gmeg-wiki  | U:OTHER      | 48   | 6    | 0     | 0.00%   | 0.00%   | 0.00%   |
| gmeg-wiki  | U:PRON       | 1    | 2    | 0     | 0.00%   | 0.00%   | 0.00%   |
| gmeg-wiki  | U:VERB       | 11   | 2    | 0     | 0.00%   | 0.00%   | 0.00%   |

Types with no gold edits are omitted. Gold types come from the corpus M2; predicted types use ERRANT's taxonomy.

### Top false-positive rules on detokenized gold text

**cweb-s-dev**

| rule                    | count | examples                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SpellCheck              | 1189  | `CSA` → `CA`: Recovery Element specifies information describing facilities and operations for County Staging Area (CSA), and Points of Distribution (POD).<br>`acoustopheresis`: These separations are of high scientific importance, especially in the biomedical domain, since acoustopheresis provides a unique approach to separation based …<br>`compressibility` → `impressibility`: These separations are of high scientific importance, especially in the biomedical domain, since acoustopheresis provides a unique approach to separation based …                                                                                                                                                                            |
| LongSentences           | 148   | `If any part of this agreement is determined to be invalid or unenforc…`: If any part of this agreement is determined to be invalid or unenforceable pursuant to applicable law including, but not limited to, the warranty disclaimers a…<br>`While you must provide an e-mail address for us to be able to provide…`: While you must provide an e-mail address for us to be able to provide a response, we recommend that you NOT include any other personal information, such as you…<br>`Directed by Hildelies Balk and Clemens Neudecker, the program has bro…`: Directed by Hildelies Balk and Clemens Neudecker, the program has brought together a number of European experts in the field to work on particular aspects of t… |
| SplitWords              | 88    | `oversample` → `overs ample`: A total of 1,082 respondents were surveyed, including an oversample of 284 Catholic respondents, who were also asked approximately twenty additional questions.<br>`microcapsules` → `micro capsules`: A previous project developed a self-healing epoxy coating using microcapsules containing tung oil.<br>`defenseman` → `defense man`: Ben McCarty scored once, as did Greg Cuccinello, Justin Mabus and close defenseman JoJo Ostrander, who capitalized on a High Point 10-man ride, leaving the goa…                                                                                                                                                                                              |
| OxfordComma             | 64    | `extractions` → `,`: We offer a full range of dental services to meet your oral health care needs, including cleanings, fillings, root canals, extractions and dentures.<br>`Brazil` → `,`: Recent work in the Midwest, Brazil and Korea has focused on linking regional macro models with transportation network models to explore impacts of unexpected e…<br>`country` → `,`: Finally, Michael has a strong interest in bottom-up forecasting of global energy consumption by region, country and sector according to econometric modeling of…                                                                                                                                                                                      |
| UnclosedQuotes          | 56    | `"`: Salmon-Safe's independent science team's final report stated: "The City of Eugene's management of the Eugene park system serves as an outstanding example of ex…<br>`"`: So, I spent months doing research and informational interviews to figure out what to do as my next career."<br>`"`: So that is obviously fantastic."                                                                                                                                                                                                                                                                                                                                                                                                     |
| NumericRangeEnDash      | 30    | `-` → `–`: Under Monsignors James Kelley (1936-1949) and John McNulty (1949-1959) a nursing program was added, a Law School opened, and extension campuses established in …<br>`-` → `–`: Under Monsignors James Kelley (1936-1949) and John McNulty (1949-1959) a nursing program was added, a Law School opened, and extension campuses established in …<br>`-` → `–`: They achieve their mission by providing free visual art classes to Chicago youth, grades 6-12.                                                                                                                                                                                                                                                                |
| Dashes                  | 28    | `--` → `–`: The sheer variation of the instances of that body, its different manifestations, undermines any attempt to use it for the wrong cultural politics--as a bad-qua…<br>`--` → `–`: TACTIC requires a wealth of data--information collection from the test environment, C-UAS systems evaluation, and flight of the UAS.<br>`--` → `–`: Yet travel speeds approaching groundwater velocity -- orders of magnitude larger than expected -- have been observed.                                                                                                                                                                                                                                                                  |
| DisjointPrefixes        | 17    | `re-imagining` → `reimagining`: Matt Garcia's artistic practice investigates ecology, its relationship to knowledge systems and how media can connect communities to a reclaiming or re-imagini…<br>`anti-war` → `antiwar`: Cline returned to the United States in 1968 and was assigned to Fort Hood, Texas, where he became involved in the anti-war movement within the Army.<br>`multi-domain` → `multidomain`: Interestingly, inspection of the catalog of natural protein assemblies reveals a hierarchical organization in which single-domain monomeric proteins constitute…                                                                                                                                                   |
| MassNouns               | 16    | `One might` → `One piece of might`: One might conclude that from Trump's perspective, Kushner is expendable.<br>`a passion` → `passion`: With a passion for collaboration, Lisa promotes projects supporting culture, community, and collaboration through her firm culture/language/dialogue.<br>`an exciting` → `exciting`: "Flavor of Georgia is an exciting, one-of-a-kind contest for our state's food artisans," said David Goodson, co-owner of 2018 Flavor of Georgia winner Goodson …                                                                                                                                                                                                                                         |
| OrthographicConsistency | 13    | `Ph` → `pH`: He earned his master's and Ph.D. degrees in electric power engineering from Rensselaer, and stayed on to do a postdoctoral position, before accepting a positio…<br>`Ph` → `pH`: Recent MOCB Ph.D. students with interests in Microbiology, Microbial Pathogenesis and Immunology have readily obtained post-doctoral appointments at prestigiou…<br>`Ph` → `pH`: Gao received his Ph.D. in control theory and control engineering from Shanghai Jiao Tong University.                                                                                                                                                                                                                                                    |

**cweb-g-dev**

| rule                   | count | examples                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SpellCheck             | 1250  | `U.` → `Uh`: The fear that our jobs are being taken, the fear that we're letting in too many criminals, the fear that those coming over are unmotivated and will be a burden…<br>`S` → `So`: The fear that our jobs are being taken, the fear that we're letting in too many criminals, the fear that those coming over are unmotivated and will be a burden…<br>`Paloukia` → `Palikir`: On the right of the Post were three other National Guard posts, namely the "Paloukia", "Mavrommatis" and "Central Prisons" posts.                                                                                                                                                                                                             |
| OxfordComma            | 97    | `fairs` → `,`: There are 90+ different food trucks in the Twin Cities that you can find at festivals, fairs or even just a street corner.<br>`program` → `,`: Supervise Jewish Life at Duke: staff that includes a rabbi, program and support staff, interns and student employees.<br>`interns` → `,`: Supervise Jewish Life at Duke: staff that includes a rabbi, program and support staff, interns and student employees.                                                                                                                                                                                                                                                                                                          |
| LongSentences          | 72    | `Left, for the most part, unchecked, the perceived importance of the s…`: Left, for the most part, unchecked, the perceived importance of the sell has fashioned a wretchedly depressed society mired in consumer impulses and confusedly…<br>`However there are days when I have wound up work early or have relati…`: However there are days when I have wound up work early or have relatively less work and on those days, I use the tab to watch YouTube videos and some of the mo…<br>`The International Committee of the Red Cross was the only agency with…`: The International Committee of the Red Cross was the only agency with independent access to these zones but since political changes led to the Burmese governme… |
| SplitWords             | 61    | `hoshin` → `ho shin`: Learn how daily management made it possible to successfully deploy hoshin plans using A3 analysis, and by creating daily feedback loops in every area of an org…<br>`rideshare` → `ride share`: Even aside from the absence of Uber and Lyft, many of these people are tired of being jerked around by the major rideshare corporations and will be happy to us…<br>`breakeven` → `break even`: 3 trading 1 loss 1 breakeven together with 1 successful.                                                                                                                                                                                                                                                         |
| UnclosedQuotes         | 46    | `"`: When I told my dad I was making coffee cake, he jokingly asked, "Cool!<br>`"`: I can't even write my name anymore."<br>`"`: I'm still very happy with the work they have done and will be reaching out to them whenever we are ready to take on our next large home improvement project."                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Dashes                 | 34    | `--` → `–`: In this case, taking only a portion of one of the works before mentioned, he chose a title adapted to the particular part selected. --<br>`--` → `–`: He's a bad man--but he's a strong bad man.<br>`--` → `–`: Why--why--We had the money, if he'd only--" She bit her fist.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| CompoundNouns          | 32    | `coffee cake` → `coffeecake`: When I told my dad I was making coffee cake, he jokingly asked, "Cool!<br>`free phone` → `freephone`: Schedule a free phone consultation by emailing [email protected] or calling 908-228-2695.<br>`bad man` → `badman`: He's a bad man--but he's a strong bad man.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| DisjointPrefixes       | 27    | `auto pilots` → `autopilots`: Using incredibly simple building blocks, things such as Facebook, stock exchange trading platforms, and even aircraft auto pilots have been forged.<br>`re-zoning` → `rezoning`: Stephenson said this could be done by re-zoning or granting a conditional use permit - though not with by-right uses - but that it was too late in this case.<br>`non-active` → `nonactive`: Japanese American men who were already in the service were no longer allowed to carry weapons and they were reassigned to non-active duty assignments.                                                                                                                                                                     |
| SentenceCapitalization | 24    | `while` → `While`: while the expensive designer jeans are Cheap Replica Coach Handbags sold in boutique-style stores.<br>`private` → `Private`: private rooftop terrace featuring unobstructed views from DTLA to the Hollywood Hills.<br>`what` → `What`: what do you remember about kindergarten?                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| MassNouns              | 21    | `coverages` → `coverage`: This will allow you to see in columns all the coverages and scopes of the plans you selected.<br>`each applying` → `each piece of applying`: The smaller and less expensive prints were usually colored by a group of young women, each applying a different color, and images with large runs were often co…<br>`accountabilities` → `accountability`: Qualified candidates are responsible for all key accountabilities in a manner that is reflective of Diversicare's Mission and Core Values: Integrity, Excellenc…                                                                                                                                                                                     |

**gmeg-wiki**

| rule                   | count | examples                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SpellCheck             | 838   | `Havelis` → `Havel's`: A lot of Jain temples and Havelis in the Jaisalmer, Udaipur, and Jodhpur regions were built by them.<br>`Jaisalmer` → `Jailer`: A lot of Jain temples and Havelis in the Jaisalmer, Udaipur, and Jodhpur regions were built by them.<br>`Udaipur` → `Jaipur`: A lot of Jain temples and Havelis in the Jaisalmer, Udaipur, and Jodhpur regions were built by them.                                                                                                                                                                                                                                                                                                                                              |
| LongSentences          | 44    | `Although the authority can not be described to function as a normal c…`: Although the authority can not be described to function as a normal central bank for the Vatican City, partly due to the fact that Vatican City does not have i…<br>`During the Doctor Who episode " The Next Doctor ", it is discovered b…`: During the Doctor Who episode " The Next Doctor ", it is discovered by the Tenth Doctor that the future incarnation of himself is actually a man named Jackson …<br>`Many reporters and analysts believe investment banks purposely leave …`: Many reporters and analysts believe investment banks purposely leave the amount of non - proprietary trading they do versus the amount of proprietary trading t… |
| DisjointPrefixes       | 19    | `pre-season` → `preseason`: It was then, in his first year, that he took the team to a notoriously rigorous pre-season training camp in 100 degree heat in Junction, Texas.<br>`non-profit` → `nonprofit`: With the non-profit SITE Institute, which she co-founded in July 2002 to monitor Islamic extremist websites and to expose terrorist front groups, she worked wi…<br>`re-elected` → `reelected`: He defeated Democrat Barry Robertson (whose campaign was heavily funded by Sam Morris, Gerlach's opponent four years earlier) in that election and was re-elect…                                                                                                                                                            |
| SplitWords             | 13    | `slotback` → `slot back`: Williams was considered a " hybrid " player, known for his physical play and being able to work from multiple positions during his eight-year career including …<br>`tonewood` → `tone wood`: George Bush is considered a tonewood, or a wood that carries sound waves well, and is used in numerous instruments such as guitars and drums.<br>`sqrt` → `sq rt`: For K < 18, an efficient design of experiments exists for this type of model, a Box-Behnken design, augmented with positive and negative axial points of length…                                                                                                                                                                            |
| CurrencyPlacement      | 12    | `$ 150` → `$150`: The project remains in the exploratory stage. No construction funding, estimated at $ 150 billion, has been obtained.<br>`$ 2` → `$2`: If any developer of an application that could be used by a Californian does n't display a privacy policy statement when their application is installed, they ar…<br>`$ 50` → `$50`: Miss Hannigan, her crooked brother Rooster (Alan Cumming), and his sleazy girlfriend, Lily St. Regis (Kristin Chenoweth) scheme to get the $ 50,000 reward by h…                                                                                                                                                                                                                          |
| MergeWords             | 12    | `could n't` → `couldn't`: Mr. Miller, then his music teacher, saw his music sheet upside down on the stand. Knowing that David could n't read music too well, he walked over and tapped h…<br>`does n't` → `doesn't`: If any developer of an application that could be used by a Californian does n't display a privacy policy statement when their application is installed, they ar…<br>`s and` → `sand`: Heart disease used to be the most common cause of death in the UK, but the number of deaths from heart disease for people in their 50s and 60s fell a lot - fal…                                                                                                                                                           |
| NumericRangeEnDash     | 8     | `-` → `–`: The next year, Bum Phillips arrived; with talented stars like Elvin Bethea and Billy " White Shoes " Johnson, the Oilers had their first winning season of the …<br>`-` → `–`: The battalion's original organization and tactics were based around Communist Chinese precepts that Carlson had witnessed while he was an observer with the Com…<br>`-` → `–`: " Singing Song Praise Motherland " is a famous patriotic song of the People's Republic of China, written and composed by Wang Xin at the beginning of the found…                                                                                                                                                                                              |
| OxfordComma            | 7     | `playwright` → `,`: In 1983, Tennessee Williams, playwright and Pulitzer Prize winner, left his literary rights to the University of the South.<br>`masters` → `,`: " T'ai Chi Chuan " (including " t ' ai chi " and their misspellings) still remains the popular spelling used by the general public today. However, many profess…<br>`Wolverhampton` → `,`: The NCSL operates five sites: the LCC, at Reddington and small offices in central London, Wolverhampton and Bolton.                                                                                                                                                                                                                                                     |
| UseEllipsisCharacter   | 5     | `...` → `…`: Nellie is a Madrigal, and she is not related to Dan and Amy... or is she?<br>`...` → `…`: According to Hayles, in the posthuman view, " There are no essential differences or absolute demarcations between bodily existence and computer simulation... "…<br>`...` → `…`: I'm Roberto. I'm an Italian Wikipedia user and I'm here to share my knowledge in various topics, like music (hard rock, heavy metal, synthpop, jazz, funk...).                                                                                                                                                                                                                                                                                 |
| SentenceCapitalization | 4     | `and` → `And`: and to increase the quality of life for its members.<br>`and` → `And`: Andrew Stuart Luster (born December 15, 1963) is the great-grandson of cosmetics giant Max Factor, Sr. and an heir to the Max Factor cosmetics fortune.<br>`n` → `N`: n uncaused cause - in other words, a deity - to resolve this problem, in which case ID reduces to religious creationism.                                                                                                                                                                                                                                                                                                                                                   |

### False-positive diagnosis

No false-positive fix was implemented in this round. The top rules need either a corpus-level policy or a spellcheck allowlist that is broader than one rule or one data file, and a global SpellCheck change risks recall.

- `SpellCheck` (1,189 CWEB-S, 1,250 CWEB-G, 838 GMEG wiki): proper nouns, acronyms, and technical terms are unknown to the curated dictionary. Examples include Udaipur, Jodhpur, Jaisalmer, Havelis, CSA, and Paloukia. Proposed: a separate proper-noun/acronym allowlist or a name-aware spellcheck path, not a global suppression.
- `LongSentences` (148 / 72 / 44): a style rule firing on naturally long website and encyclopedia sentences. It is not a grammar edit and should be excluded from a GEC precision gate or reported separately.
- `SplitWords` (88 / 61 / 13): compound-word policy disagreements such as oversample, microcapsules, and defenseman. Proposed: extend the compound dictionary rather than loosen the splitter.
- `OxfordComma` (64 / 97): inserts a serial comma where the reference text omits it. This is a style preference, not a grammatical error; keep it out of the GEC gate.
- `UnclosedQuotes` (56 / 46): quotes embedded in long, sometimes malformed source text. Needs a quote-balance analysis before changing the rule.
- `NumericRangeEnDash` (30) and `Dashes` (28 / 34): typographic preferences (hyphen vs en dash, doubled hyphen). Style-only for this gate.
- `DisjointPrefixes` (17 / 27 / 19): prefers closed forms such as reimagining, antiwar, and nonprofit. Policy disagreement; proposed dictionary review.
- `MassNouns` (16 / 21): over-applies mass-noun corrections such as `One might` to `One piece of might`; rule-specific and needs its own test corpus.
- `OrthographicConsistency` (13): flags `Ph` in `Ph.D.` as `pH`; a narrow capitalization fix is possible but was not attempted because it needs rule-level tests and a decision on degree abbreviations.
- `CompoundNouns` (32) and `SentenceCapitalization` (24): closed-compound and sentence-start policy disagreements; no narrow fix.

## Spelling and developer writing

| set             | n   | detection/recall | @1     | @3     |
| --------------- | --- | ---------------- | ------ | ------ |
| word-level      | 300 | 96.00%           | 72.67% | 85.00% |
| developer prose | 60  | 85.00%           | 75.00% | 78.33% |

Developer prose fixtures: 4 substituted, 56 injected; precision 83.61%.

Clean prose false positives: 23 spelling lints in 2345 words (9.81 per 1k).

### Clean-prose spelling lints

| word           | suggestion   | sentence                                                                                                                                                                             |
| -------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SmallVec`     | `Smaller`    | TODO: remove this when `SmallVec` allows retrieving this value in a const context.                                                                                                   |
| `DialectFlags` | `Dialect's`  | The underlying type used for DialectFlags.                                                                                                                                           |
| `DialectFlags` | `Dialect's`  | Get and convert the collection of most used dialects into a `DialectFlags`.                                                                                                          |
| `DialectFlags` | `Dialect's`  | Fold most used dialects into `DialectFlags` via bitwise or.                                                                                                                          |
| `R&D`          | `Rad`        | Condenses "ampersand pairs" such as "R&D" or "Q&A" into single tokens.                                                                                                               |
| `I/O`          | `IMO`        | Condenses "slash pairs" such as "I/O" into single tokens.                                                                                                                            |
| `Expr`         | `Exp`        | ! An `Expr` is a declarative way to express whether a certain set of tokens fulfill a criteria.                                                                                      |
| `ExprLinter`   | `Expediter`  | ! The actual searching is done by another system (usually a part of the [lint framework](crate::linting::ExprLinter)).                                                               |
| `Expr`         | `Exp`        | ! When supplied a specific position in a token stream, the technical job of an `Expr` is to determine the window of tokens (including the cursor itself) that fulfills whatever cri… |
| `Expr`         | `Exp`        | ! The goal of the `Expr` initiative is to make rules easier to _read_ as well as to write.                                                                                           |
| `standalones`  | `standalone` | These can make a compound with the part_2 standalones above.                                                                                                                         |
| `z0`           | `z`          | ([a-z0-9]+ only) - We previously flagged just the z0 in the middle of it.                                                                                                            |
| `ReplaceWith`  | `Replacer's` | We use `ReplaceWith` rather than `Remove` because the latter has no case-matching.                                                                                                   |
| `Internt`      | `Intent`     | Tests using real-world sentences from the Internt.                                                                                                                                   |
| `favourite`    | `favorite`   | Some resources call 'favourite' an 'absolute adjective', some consider it a superlative.                                                                                             |
| `OOV`          | `OOP`        | We include OOV because novel words not in the dictionary tend to be nouns.                                                                                                           |
| `Automod`      | `Autoload`   | You might be better off served by making Automod hold all posts and/or comments.                                                                                                     |
| `OOV`          | `OOP`        | because OOV words are most commonly nouns.                                                                                                                                           |
| `ing`          | `in`         | Verbs in -ing are also gerunds, which are nouns.                                                                                                                                     |
| `non-native`   | `nonnative`  | Ambiguous. Probably a non-native speaker that means "least worst", but offer all three options.                                                                                      |
| `Expr`         | `Exp`        | We have to use `Sentence` if our `Expr` includes commas!                                                                                                                             |
| `OK`           | `OKAY`       | US is a qualifier meaning American, so uppercase after a possessive is OK.                                                                                                           |
| `OK`           | `OKAY`       | "you" is subject and object both OK before "want".                                                                                                                                   |

| Birkbeck list | sample | detection | detected |
| ------------- | ------ | --------- | -------- |
| missp         | 200    | 84.50%    | 169      |
| holbrook      | 200    | 58.00%    | 116      |
| aspell        | 200    | 91.50%    | 183      |
| wikipedia     | 200    | 93.50%    | 187      |

Sources: codespell (64966 pairs), wikipedia (4276 pairs), typos-cli (95923 pairs).

## Extension acceptance (Playwright, headed Chromium)

| gate                            | observed           | limit | result |
| ------------------------------- | ------------------ | ----- | ------ |
| paste underline <= 700 ms       | 15                 | 700   | PASS   |
| full draft tail underlined      | True               | True  | PASS   |
| highlight in shadow root        | True               | True  | PASS   |
| shadow-root editor linted       | True               | True  | PASS   |
| LinkedIn dialog paste <= 700 ms | 9                  | 700   | PASS   |
| Gmail prefilled draft <= 700 ms | 205                | 700   | PASS   |
| card width <= 280 px            | 265.99999237060547 | 280   | PASS   |
| card opens <= 300 ms            | 32                 | 300   | PASS   |
| no dialog calls                 | []                 | []    | PASS   |
| no open dialog elements         | 0                  | 0     | PASS   |

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
