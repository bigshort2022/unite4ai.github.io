---
name: BFCL multiple (first 50)
summary: The first 50 items of the Berkeley Function Calling Leaderboard's "multiple" category, asked in Unite4AI's tool-selection format and scored by a port of BFCL's checker. A reference point for tool selection, not a BFCL score.
category: quality
version: "1"
metric:
  name: correct on every run
  unit: "%"
  higher_is_better: true
  min: 0
  max: 100
scoring: exact-match
items: 50
repeat:
  runs: 5
  temperature: 0.7
  top_p: 1
source_url: https://raw.githubusercontent.com/ShishirPatil/gorilla/f7cf7359b7ac615a0b294831c5ba2bc95ee4a000/berkeley-function-call-leaderboard/bfcl_eval/data/BFCL_v4_multiple.json
source_sha256: aef168155ebd74b7ac2401198b201343bc7d16d7a3d7e0d4e6d8ee82c6969b2a
license: apache-2.0
updated: 2026-11-22
---

## What it measures

The same skill as [Tool selection](/evals/tool-selection-v1), on items written by someone else:
each of the first 50 items of the [Berkeley Function Calling Leaderboard](https://gorilla.cs.berkeley.edu/leaderboard.html)
(BFCL) "multiple" category is one request and two or three functions, of which exactly one
should be called. The items are public, independent of Unite4AI and widely used, so results
here are a check on whether a model's tool-selection score reflects the skill or the way
Unite4AI's own items are written.

**This is not a BFCL score.** BFCL asks in its own formats, over all 200 items of the
category, once per model. This benchmark asks in Unite4AI's format, over 50 items, five
times. Its numbers are not comparable with BFCL's published leaderboard.

## Method

1. An evaluation must use two files of BFCL at commit `f7cf7359b7ac615a0b294831c5ba2bc95ee4a000`
   of `ShishirPatil/gorilla`, checked against their SHA-256: the questions at `source_url`
   (`source_sha256`), and the possible answers at
   `https://raw.githubusercontent.com/ShishirPatil/gorilla/f7cf7359b7ac615a0b294831c5ba2bc95ee4a000/berkeley-function-call-leaderboard/bfcl_eval/data/possible_answer/BFCL_v4_multiple.json`,
   with SHA-256 `244e00ce9395df948bcafc7bee64e8f9c87ef70887587d83cae45b13699f3047`. Unite4AI does not
   serve these files; the runner fetches them from BFCL's repository.
2. The items are the first 50 lines of both files, `multiple_0` to `multiple_49`. Each has one
   user message, two or three functions, and one expected call.
3. Every item is its own conversation of two messages. The system message is the one
   [Tool selection](/evals/tool-selection-v1) uses, word for word. The user message is
   `Request: `, BFCL's user message, a blank line, `Tools:`, a newline, and the item's
   functions as JSON indented by two spaces, with BFCL's types `dict`, `float` and `tuple`
   written as JSON Schema's `object`, `number` and `array`. Function names keep their dots.
4. Each of the 50 items is sent five times: five runs, each one full pass over the items in
   file order, one request at a time. Every request uses temperature 0.7, top-p 1 and at most
   1024 new tokens, and carries a seed equal to its position (run × 50 + item, both counted
   from 0). Whether the server honours the seed is not checked.
5. The **answer** is the last JSON object in the reply with its reasoning removed, as in Tool
   selection. Its `tool` must be a string and its `arguments` an object; an `arguments` that
   is missing or `null` counts as empty, and an argument whose value is `null` counts as left
   out.
6. The answer is **correct** when BFCL's checker for the "multiple" category, in its Python
   mode, would accept the call. Unite4AI runs a port of that checker
   (`apps/cli/src/eval/bfcl.ts`), not BFCL's code:
   - the function name must be the expected one, exactly;
   - every required parameter must be given, and no parameter outside the expected call;
   - each value must have its parameter's type and be one of the values BFCL lists as
     accepted. Strings compare after BFCL's normalisation (spaces and `, . / - _ * ^`
     removed, lower case, and `'` read as `"`); lists compare element by element after the same normalisation of
     their strings; dicts compare key by key;
   - a parameter of the expected call may be left out only when BFCL lists `""` among its
     accepted values.

   JSON does not tell `2` from `2.0`. So a whole number counts as a float wherever a float is
   expected, including inside lists, and a number counts as an integer only when it is whole.
   This and the `null` rule of step 5 are the only places Unite4AI's scoring departs from
   BFCL's checker, which sees Python values; the cross-check applies both before calling
   BFCL's checker.
7. The **score** is the percentage of the 50 items answered correctly on all five runs. Every
   result also gives pass@1, the percentage of the 250 answers that were correct; how many items
   each run got right; and the sample standard deviation of the five run scores. All five runs
   must finish: partial runs are not accepted.
8. **Intervals** count items, not answers: a 95% Wilson interval over the 50 items for the
   score, and a 95% percentile bootstrap over items for pass@1 (2,000 resamples, the mulberry32
   generator, seed 20261122). The content gate recomputes both from the published counts.

## How the port is checked against BFCL

`scripts/benchmarks/bfcl_crosscheck.py` fetches BFCL's checker at the same commit, checks its
hash, and scores answers with it.

- **Before any run:** for every item, it builds the right call in its plainest forms and one
  mistake at a time: wrong function, a required parameter missing, an unexpected parameter, a
  needed optional parameter missing, a string with other case and separators, a wrong string,
  an integer written as a string or as a fraction or off by one, a float as a whole number or
  a string, a flipped, quoted or numeric boolean, a reversed or upper-cased list, a list written as
  a string, a dict missing a key or with an extra one. BFCL's verdicts on these 463 answers are committed
  (`apps/cli/test/fixtures/bfcl/conformance.json`), and a test requires the port to give the
  same verdict on every one.
- **Before the first result is published:** the same script scores one baseline run's recorded
  answers with BFCL's checker and lists every answer where the two disagree. Each disagreement
  is either fixed in the port or listed on this page before publication.

## Known weaknesses

- **Not BFCL's format.** BFCL's prompting and function-calling modes ask differently; a model
  can do better or worse here than there.
- **Small.** With 50 items the score's 95% interval spans about 22 points near 80% (67 to 89
  for 40 of 50).
- **Public and widely used.** The items are published with BFCL and may be in a model's
  training data.
- **BFCL's answers, BFCL's rules.** Where BFCL's accepted values are narrow (one spelling of a
  place, one unit), a reasonable answer is marked wrong here as it is there. The string
  normalisation also makes some different values equal, such as `a-b` and `ab`.
- **English only**, single-turn, one call per item.

## Licence

The items are BFCL's, by the Gorilla team at UC Berkeley, released under the Apache License
2.0. This page and the port are Unite4AI's. The test suite carries a copy of the two files and
of the licence under `apps/cli/test/fixtures/bfcl/`.
