# BFCL Calibration Slice Implementation Plan (agent evidence, plan 3 of 8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `bfcl-multiple-50`: the first 50 items of the Berkeley Function Calling Leaderboard's "multiple" category, asked in tool-selection-v1's prompted format, scored by a port of BFCL's own checker that is proven to give BFCL's verdict on a committed corpus of 463 answers.

**Architecture:** The runner gains one generic feature: a suite may name a second pinned file (`answers`), loaded through the same hash-checked path as the source and recorded in the transcript header. A new suite (`apps/cli/src/eval/bfcl.ts`) parses BFCL's question and answer files, renders the tool-selection prompt with BFCL's types written as JSON Schema's, and ports BFCL's Python checker for the types these items use, failing loudly on anything else. `scripts/benchmarks/bfcl_crosscheck.py` runs BFCL's real checker (fetched at the pinned commit, hash-checked, standard library only) to write the conformance corpus now and to cross-check a real run's transcript later.

**Tech Stack:** Bun workspace, TypeScript (`apps/cli`), Python 3 standard library (one script), Astro 7 content collections, `node:test` under `bun test`.

**Spec:** `docs/superpowers/specs/2026-11-22-agent-evidence-design.md`, section "Calibration slice (`bfcl-multiple-50`)". Delivery step 3. Builds on plans 1 and 2 (merged in #35 and #38).

---

## Scope

In: the second-source runner feature, the suite and checker port, BFCL fixtures and licence, the cross-check script and committed conformance corpus, the benchmark page, form option, page-test lists, contributor docs.

Not here: the spec's run-based calibration check ("the outputs of one baseline run are also scored with BFCL's own checker"). It needs a model run, so it happens after the first baseline run (plan 4), with `bfcl_crosscheck.py transcript`. This plan adds a model-free check that the spec did not ask for and that runs in CI: BFCL's verdicts on 463 synthetic answers, which the port must reproduce exactly.

## Decisions made while planning

| Question | Decision |
|---|---|
| How to score "every required parameter takes one of the values BFCL lists" | Port BFCL's checker (`ast_checker.py`, Python mode, "multiple" category) rather than paraphrase it: string normalisation, list and dict comparison, int accepted for float, unexpected and missing parameters. |
| Types the port supports | Those the 50 items use: string, integer, float, boolean, array and tuple of scalars, dict. Any other type makes `parseItems` throw, so a future slice cannot be scored silently wrong. BFCL's "variable" path is not ported: no answer in these items uses one. |
| JSON numbers | JSON cannot tell `2` from `2.0`. A whole number counts as a float wherever a float is expected (also inside lists), and a number counts as an integer only when whole. The cross-check script applies the same rule before calling BFCL's checker, so both judge the same values. Stated on the page as one of two departures from BFCL; the other is the `null` rule of answer extraction. |
| Where the answers live | BFCL publishes questions and answers as two files. The questions are the definition's `source_url`; the answers are a second pinned file the suite declares (URL and SHA-256 in code, both stated on the page and checked by a test). No schema change. |
| Rehosting | The site does not serve BFCL's files; the runner fetches them from GitHub at the pinned commit. The test fixtures carry unmodified copies with BFCL's Apache-2.0 licence, so tests never touch the network. |
| Prompt | tool-selection-v1's system message word for word (a test compares them) and the same user-message shape; BFCL's `dict`, `float`, `tuple` become `object`, `number`, `array`; dotted function names stay. |
| Answer extraction | The last JSON object of the visible reply, as in tool selection; `tool` must be a string, `arguments` an object; `null` arguments count as left out. |
| Method | 5 runs at temperature 0.7, 1024 tokens, like tool selection; licence `apache-2.0`. |
| Found in final review | The page now promises the BFCL cross-check before the first result is published (as the spec says), names the `null` rule as a second departure from BFCL, gives the answers file's full URL and the `'`→`"` normalisation. `loadSource` takes a label, so a missing or corrupt answers file is reported as the answers file, with its path or URL (commit 4091386). |
| Found in review | The corpus first missed a deleted type check (Python's `1 == True`) and a dict accepting an extra key; `boolean_as_number` and `dict_extra_key` variants now cover both. `parseItems` refuses any item whose accepted values would take BFCL's variable path. |
| Found while planning | A first draft of the corpus builder took a dict's accepted value as-is (a dict of lists), so BFCL rejected two "canonical" answers; the builder now takes the first value of each key. A mutant check showed the port's "parameter not in the expected call" branch is unreachable on these items, because BFCL's answers list every parameter (optional ones with `""`); the corpus therefore has no variant for it. |

## Before you start

```bash
cd /Users/b33j/unite4ai
git fetch origin
git worktree add ../unite4ai-bfcl -b bfcl-calibration origin/main   # skip if it exists
cd ../unite4ai-bfcl
bun install --frozen-lockfile
npm ci --prefix sites/sustainability
source scripts/agent/activate-node.sh
```

`python3` (3.9 or later) must be on the path for Task 1's corpus step; nothing else uses it. Commit with the eval `commit` namespace; never `git add`/`git commit`.

## File structure

| File | Change | Responsibility |
|---|---|---|
| `apps/cli/test/fixtures/bfcl/BFCL_v4_multiple.json`, `BFCL_v4_multiple_possible_answer.json`, `LICENSE` | create (downloaded) | BFCL's files at the pinned commit, for offline tests |
| `apps/cli/test/fixtures/bfcl/README.md` | create | Where the fixtures come from and how the corpus is made |
| `scripts/benchmarks/bfcl_crosscheck.py` | create | Runs BFCL's checker: writes the corpus; cross-checks a transcript |
| `apps/cli/test/fixtures/bfcl/conformance.json` | create (generated) | 463 answers with BFCL's verdicts |
| `apps/cli/src/eval/bfcl.ts` | create | Parse, prompt, checker port, judge |
| `apps/cli/src/eval/suites.ts` | modify | `answers` on `Suite`; register `bfcl-multiple-50` |
| `apps/cli/src/eval/run.ts` | modify | Load the answers file; record its hash in the header |
| `apps/web/src/content/benchmarks/bfcl-multiple-50.md` | create | Definition and published method |
| `.github/ISSUE_TEMPLATE/submit-eval-result.yml` | modify | Offer the benchmark |
| `apps/web/test/evals-pages.test.mjs` | modify | Feed lists the benchmark; GSM8K looked up by id, not position |
| `CONTRIBUTING.md` | modify | Runnable benchmarks; downloads and the cross-check |
| `apps/cli/test/bfcl.test.mjs` | create | Fixtures, items, prompt, conformance, judge, page, end-to-end run |

---

### Task 1: BFCL fixtures, cross-check script and conformance corpus

**Files:**
- Create (downloaded): `apps/cli/test/fixtures/bfcl/BFCL_v4_multiple.json`, `apps/cli/test/fixtures/bfcl/BFCL_v4_multiple_possible_answer.json`, `apps/cli/test/fixtures/bfcl/LICENSE`
- Create: `apps/cli/test/fixtures/bfcl/README.md`, `scripts/benchmarks/bfcl_crosscheck.py`
- Create (generated): `apps/cli/test/fixtures/bfcl/conformance.json`

- [ ] **Step 1: Download BFCL's files at the pinned commit and check them**

````bash
base=https://raw.githubusercontent.com/ShishirPatil/gorilla/f7cf7359b7ac615a0b294831c5ba2bc95ee4a000
dir=apps/cli/test/fixtures/bfcl
mkdir -p $dir
curl -sfL -o $dir/BFCL_v4_multiple.json $base/berkeley-function-call-leaderboard/bfcl_eval/data/BFCL_v4_multiple.json
curl -sfL -o $dir/BFCL_v4_multiple_possible_answer.json $base/berkeley-function-call-leaderboard/bfcl_eval/data/possible_answer/BFCL_v4_multiple.json
curl -sfL -o $dir/LICENSE $base/LICENSE
shasum -a 256 $dir/*.json
````

Expected: `aef168155ebd74b7ac2401198b201343bc7d16d7a3d7e0d4e6d8ee82c6969b2a` for `BFCL_v4_multiple.json` and `244e00ce9395df948bcafc7bee64e8f9c87ef70887587d83cae45b13699f3047` for the answers; `LICENSE` starts with `Apache License`. Any other hash: stop and report.

- [ ] **Step 2: Write the fixture README**

Create `apps/cli/test/fixtures/bfcl/README.md`:

````markdown
# BFCL test fixtures

`BFCL_v4_multiple.json` and `BFCL_v4_multiple_possible_answer.json` are unmodified copies of
`berkeley-function-call-leaderboard/bfcl_eval/data/BFCL_v4_multiple.json` and
`.../data/possible_answer/BFCL_v4_multiple.json` from
[ShishirPatil/gorilla](https://github.com/ShishirPatil/gorilla) at commit
`f7cf7359b7ac615a0b294831c5ba2bc95ee4a000`, by the Gorilla team at UC Berkeley, released under
the Apache License 2.0 (`LICENSE`, copied from the same commit). The tests use them so that
they never touch the network; the runner fetches the same files from GitHub and checks the same
hashes.

`conformance.json` is written by `python3 scripts/benchmarks/bfcl_crosscheck.py corpus`: answers
built from those files, with the verdict of BFCL's own checker on each.
````

- [ ] **Step 3: Write the cross-check script**

Create `scripts/benchmarks/bfcl_crosscheck.py` (executable, `chmod +x`):

````python
#!/usr/bin/env python3
"""Score bfcl-multiple-50 answers with BFCL's own checker, to calibrate Unite4AI's port of it.

BFCL's checker (bfcl_eval/eval_checker/ast_eval/ast_checker.py) is fetched at the pinned commit
and checked against its hash; only the Python standard library is needed. Two modes:

  corpus      Build synthetic answers for every item (right ones, and the near misses a model
              makes), score them with BFCL's checker, and write the verdicts to
              apps/cli/test/fixtures/bfcl/conformance.json. A test replays them through the port.
  transcript  Score the answers a run recorded (its transcript's `extracted` fields) with BFCL's
              checker, and list every item where BFCL and the port disagree.

Usage:
  python3 scripts/benchmarks/bfcl_crosscheck.py corpus
  python3 scripts/benchmarks/bfcl_crosscheck.py transcript .agent/evals/<transcript>.jsonl

Answers travel as JSON, which cannot tell 2 from 2.0. Before BFCL's checker sees an answer, a
whole number where the schema expects a float is made a float, as the published method states.
"""
import enum
import hashlib
import json
import sys
import types
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMMIT = "f7cf7359b7ac615a0b294831c5ba2bc95ee4a000"
BASE = f"https://raw.githubusercontent.com/ShishirPatil/gorilla/{COMMIT}/berkeley-function-call-leaderboard/bfcl_eval"
CHECKER = (f"{BASE}/eval_checker/ast_eval/ast_checker.py", "2aae7a68461a8f76c0be3894c8901b66b56967a1989d3ab066051e3fb97f1538")
QUESTIONS = (f"{BASE}/data/BFCL_v4_multiple.json", "aef168155ebd74b7ac2401198b201343bc7d16d7a3d7e0d4e6d8ee82c6969b2a")
ANSWERS = (f"{BASE}/data/possible_answer/BFCL_v4_multiple.json", "244e00ce9395df948bcafc7bee64e8f9c87ef70887587d83cae45b13699f3047")
FIXTURES = ROOT / "apps/cli/test/fixtures/bfcl"
COUNT = 50
MODEL = "unite4ai"


def pinned(url_and_hash, local=None):
    """The file's text, from a local copy when there is one, else the network; its hash must match."""
    url, digest = url_and_hash
    from_local = local is not None and local.exists()
    data = local.read_bytes() if from_local else urllib.request.urlopen(url, timeout=60).read()
    actual = hashlib.sha256(data).hexdigest()
    if actual != digest:
        sys.exit(f"hash mismatch for {local if from_local else url}: expected {digest}, got {actual}")
    return data.decode("utf-8")


def load_checker():
    """BFCL's ast_checker module, with the package imports it makes for other languages stubbed out."""
    def module(name, **attributes):
        stub = types.ModuleType(name)
        stub.__dict__.update(attributes)
        sys.modules[name] = stub

    class Language(enum.Enum):
        PYTHON = "python"
        JAVA = "java"
        JAVASCRIPT = "javascript"

    class Config:
        underscore_to_dot = False  # The prompted format keeps dotted names as they are.

    for name in ["bfcl_eval", "bfcl_eval.constants", "bfcl_eval.eval_checker", "bfcl_eval.eval_checker.ast_eval",
                 "bfcl_eval.eval_checker.ast_eval.type_convertor"]:
        module(name)
    module("bfcl_eval.constants.enums", Language=Language)
    module("bfcl_eval.constants.model_config", MODEL_CONFIG_MAPPING={MODEL: Config()})
    module("bfcl_eval.constants.type_mappings", JAVA_TYPE_CONVERSION={}, JS_TYPE_CONVERSION={})
    module("bfcl_eval.eval_checker.ast_eval.type_convertor.java_type_converter", java_type_converter=None)
    module("bfcl_eval.eval_checker.ast_eval.type_convertor.js_type_converter", js_type_converter=None)
    checker = types.ModuleType("ast_checker")
    exec(compile(pinned(CHECKER), "ast_checker.py", "exec"), checker.__dict__)
    return checker, Language


def items():
    questions = [json.loads(line) for line in pinned(QUESTIONS, FIXTURES / "BFCL_v4_multiple.json").splitlines() if line.strip()]
    answers = [json.loads(line) for line in pinned(ANSWERS, FIXTURES / "BFCL_v4_multiple_possible_answer.json").splitlines() if line.strip()]
    result = []
    for question, answer in zip(questions[:COUNT], answers[:COUNT]):
        assert question["id"] == answer["id"]
        ((name, params),) = answer["ground_truth"][0].items()
        result.append({"id": question["id"], "functions": question["function"], "name": name, "params": params,
                       "ground_truth": answer["ground_truth"]})
    return result


def as_floats(value, schema):
    """A whole number where the schema expects a float, made a float, in lists too."""
    kind = schema.get("type")
    if kind == "float" and type(value) == int:
        return float(value)
    if kind in ("array", "tuple") and isinstance(value, list) and schema.get("items", {}).get("type") == "float":
        return [float(v) if type(v) == int else v for v in value]
    return value


def bfcl_verdict(checker, language, item, tool, arguments):
    function = next((f for f in item["functions"] if f["name"] == tool), None)
    properties = function["parameters"]["properties"] if function else {}
    arguments = {k: as_floats(v, properties.get(k, {})) for k, v in arguments.items() if v is not None}
    result = checker.ast_checker(item["functions"], [{tool: arguments}], item["ground_truth"], language.PYTHON, "multiple", MODEL)
    # BFCL leaves an error type such as "simple_function_checker:unclear" on some valid results.
    return result["valid"], (None if result["valid"] else result.get("error_type"))


def first(values):
    return next((v for v in values if v != ""), None)


def variants(item):
    """Answers a model might give: the right call in its plainest forms, and one mistake at a time."""
    function = next(f for f in item["functions"] if f["name"] == item["name"])
    properties = function["parameters"]["properties"]
    required = function["parameters"]["required"]
    # A dict's accepted value is itself a dict of accepted values per key: take the first of each.
    canonical = {p: ({k: first(v) for k, v in first(vs).items() if first(v) is not None} if isinstance(first(vs), dict) else first(vs))
                 for p, vs in item["params"].items() if first(vs) is not None}
    minimal = {p: v for p, v in canonical.items() if "" not in item["params"][p]}
    out = [("canonical", item["name"], canonical), ("minimal", item["name"], minimal)]
    other = next((f["name"] for f in item["functions"] if f["name"] != item["name"]), None)
    if other:
        out.append(("wrong_function", other, canonical))
    if required:
        out.append(("missing_required", item["name"], {p: v for p, v in canonical.items() if p != required[0]}))
    out.append(("unexpected_param", item["name"], {**canonical, "unite4ai_extra": 1}))
    needed_optional = next((p for p in item["params"] if p not in required and "" not in item["params"][p]), None)
    if needed_optional:
        out.append(("missing_needed_optional", item["name"], {p: v for p, v in canonical.items() if p != needed_optional}))

    def first_of(kind):
        return next((p for p in canonical if properties.get(p, {}).get("type") == kind), None)

    def changed(name, param, value):
        out.append((name, item["name"], {**canonical, param: value}))

    if (p := first_of("string")) is not None:
        changed("string_case_and_separators", p, canonical[p].upper().replace(" ", "_"))
        changed("string_wrong", p, canonical[p] + " x")
    if (p := first_of("integer")) is not None:
        changed("integer_as_string", p, str(canonical[p]))
        changed("integer_as_fraction", p, canonical[p] + 0.5)
        changed("integer_off_by_one", p, canonical[p] + 1)
    if (p := first_of("float")) is not None:
        changed("float_as_whole_number", p, int(round(canonical[p])))
        changed("float_as_string", p, str(canonical[p]))
    if (p := first_of("boolean")) is not None:
        changed("boolean_flipped", p, not canonical[p])
        changed("boolean_as_string", p, str(canonical[p]).lower())
        changed("boolean_as_number", p, int(canonical[p]))
    for kind in ("array", "tuple"):
        if (p := first_of(kind)) is not None:
            if len(canonical[p]) > 1:
                changed(f"{kind}_reversed", p, list(reversed(canonical[p])))
            if canonical[p] and all(isinstance(v, str) for v in canonical[p]):
                changed(f"{kind}_strings_upper", p, [v.upper() for v in canonical[p]])
            changed(f"{kind}_as_string", p, json.dumps(canonical[p]))
    if (p := first_of("dict")) is not None and canonical[p]:
        key = next(iter(canonical[p]))
        changed("dict_missing_key", p, {k: v for k, v in canonical[p].items() if k != key})
        changed("dict_extra_key", p, {**canonical[p], "unite4ai_extra": 1})
    return out


def corpus():
    checker, language = load_checker()
    entries = []
    for item in items():
        for variant, tool, arguments in variants(item):
            valid, error_type = bfcl_verdict(checker, language, item, tool, arguments)
            entries.append({"id": item["id"], "variant": variant, "tool": tool, "arguments": arguments,
                            "valid": valid, "error_type": error_type})
    out = {"commit": COMMIT, "checker_sha256": CHECKER[1], "questions_sha256": QUESTIONS[1],
           "answers_sha256": ANSWERS[1], "entries": entries}
    path = FIXTURES / "conformance.json"
    path.write_text(json.dumps(out, indent=1, sort_keys=False) + "\n")
    valid = sum(e["valid"] for e in entries)
    print(f"wrote {len(entries)} answers ({valid} valid by BFCL) to {path.relative_to(ROOT)}")


def transcript(path):
    lines = [json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()]
    header = lines[0] if lines else {}
    if (header.get("type") != "header" or header.get("benchmark") != "bfcl-multiple-50"
            or header.get("prompt_version") != "bfcl-multiple-1"):
        sys.exit(f"not a bfcl-multiple-50 transcript of prompt version bfcl-multiple-1: {path}")
    checker, language = load_checker()
    by_index = items()
    answers = [line for line in lines if line.get("type") == "item"]
    agree = 0
    disagreements = []
    for line in answers:
        item = by_index[line["index"]]
        answer = json.loads(line["extracted"]) if line.get("extracted") else None
        tool = answer.get("tool") if isinstance(answer, dict) else None
        arguments = answer.get("arguments") if isinstance(answer, dict) else None
        if arguments is None:
            arguments = {}
        if isinstance(tool, str) and isinstance(arguments, dict):
            valid, error_type = bfcl_verdict(checker, language, item, tool, arguments)
        else:
            valid, error_type = False, "no_call"
        if valid == line["correct"]:
            agree += 1
        else:
            disagreements.append((line.get("run", 0), item["id"], line["correct"], valid, error_type, line["extracted"]))
    print(f"{agree} of {len(answers)} answers scored the same by BFCL's checker and the port")
    for run, item_id, ours, theirs, error_type, extracted in disagreements:
        print(f"run {run} {item_id}: port {'right' if ours else 'wrong'}, BFCL {'right' if theirs else 'wrong'} ({error_type}): {extracted}")
    return 1 if disagreements else 0


if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "corpus":
        corpus()
    elif len(sys.argv) == 3 and sys.argv[1] == "transcript":
        sys.exit(transcript(sys.argv[2]))
    else:
        sys.exit(__doc__)
````

- [ ] **Step 4: Generate the corpus**

Run: `python3 scripts/benchmarks/bfcl_crosscheck.py corpus`
Expected: `wrote 463 answers (138 valid by BFCL) to apps/cli/test/fixtures/bfcl/conformance.json`. The script downloads BFCL's checker at the pinned commit and refuses to run if its SHA-256 is not `2aae7a68461a8f76c0be3894c8901b66b56967a1989d3ab066051e3fb97f1538`. Running it again must leave the file unchanged (`git diff --stat` empty after a second run).

- [ ] **Step: Commit**

Subject: `test(bfcl): BFCL fixtures, cross-check script and conformance corpus`. Files: `apps/cli/test/fixtures/bfcl/BFCL_v4_multiple.json`, `apps/cli/test/fixtures/bfcl/BFCL_v4_multiple_possible_answer.json`, `apps/cli/test/fixtures/bfcl/LICENSE`, `apps/cli/test/fixtures/bfcl/README.md`, `apps/cli/test/fixtures/bfcl/conformance.json`, `scripts/benchmarks/bfcl_crosscheck.py`.

---

### Task 2: Suite and checker port

**Files:**
- Create: `apps/cli/src/eval/bfcl.ts`
- Test: `apps/cli/test/bfcl.test.mjs` (created here; Task 3 extends it)

- [ ] **Step 1: Write the failing tests**

Create `apps/cli/test/bfcl.test.mjs`:

````js
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { SYSTEM as TOOL_SELECTION_SYSTEM } from '../../../scripts/benchmarks/tool-selection.mjs';
import { ANSWERS, BFCL_COMMIT, SYSTEM, buildMessages, checkCall, judge, parseItems, standardize } from '../src/eval/bfcl.ts';

const FIXTURES = fileURLToPath(new URL('./fixtures/bfcl/', import.meta.url));
const QUESTIONS_FILE = join(FIXTURES, 'BFCL_v4_multiple.json');
const ANSWERS_FILE = join(FIXTURES, 'BFCL_v4_multiple_possible_answer.json');
const QUESTIONS_SHA256 = 'aef168155ebd74b7ac2401198b201343bc7d16d7a3d7e0d4e6d8ee82c6969b2a';
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const QUESTIONS = readFileSync(QUESTIONS_FILE, 'utf8');
const ANSWER_KEY = readFileSync(ANSWERS_FILE, 'utf8');
const ITEMS = parseItems(QUESTIONS, ANSWER_KEY, 50);
const CONFORMANCE = JSON.parse(readFileSync(join(FIXTURES, 'conformance.json'), 'utf8'));

// ─── Source ──────────────────────────────────────────────────────────────────

test('the fixtures are BFCL\'s files at the pinned commit, with its licence', () => {
  assert.equal(sha256(readFileSync(QUESTIONS_FILE)), QUESTIONS_SHA256);
  assert.equal(sha256(readFileSync(ANSWERS_FILE)), ANSWERS.sha256);
  assert.match(readFileSync(join(FIXTURES, 'LICENSE'), 'utf8'), /Apache License\s+Version 2\.0/);
  assert.ok(ANSWERS.url.includes(`/gorilla/${BFCL_COMMIT}/`));
});

test('the items are the first 50 of the category, each with one request and the call it expects', () => {
  assert.deepEqual(ITEMS.map((item) => item.id), Array.from({ length: 50 }, (_, index) => `multiple_${index}`));
  for (const item of ITEMS) {
    assert.ok(item.request.length > 0);
    assert.ok(item.functions.length >= 2 && item.functions.length <= 3, item.id);
    assert.ok(item.functions.some((fn) => fn.name === item.answer.name), item.id);
  }
  assert.equal(ITEMS[1].request, 'Calculate the area of a triangle, given the lengths of its three sides: 3, 4, and 5.');
  assert.deepEqual(ITEMS[1].answer, { name: 'math.triangle_area_heron', params: { side1: [3], side2: [4], side3: [5] } });
});

test('a source that does not fit is refused, naming the item', () => {
  const rows = QUESTIONS.trim().split('\n');
  assert.throws(() => parseItems(rows.slice(0, 10).join('\n'), ANSWER_KEY, 50), /has 10 items; the benchmark needs 50/);
  const nested = JSON.parse(rows[0]);
  nested.function[0].parameters.properties.extra = { type: 'array', items: { type: 'dict' }, description: 'x' };
  assert.throws(() => parseItems([JSON.stringify(nested), ...rows.slice(1)].join('\n'), ANSWER_KEY, 50), /multiple_0: .*arrays of dict are not supported/);
  const shuffled = [rows[1], rows[0], ...rows.slice(2)].join('\n');
  assert.throws(() => parseItems(shuffled, ANSWER_KEY, 50), /item 1: expected id multiple_0/);
  const answerRows = ANSWER_KEY.trim().split('\n');
  const stringly = JSON.parse(answerRows[1]);
  stringly.ground_truth[0]['math.triangle_area_heron'].side1 = ['3'];
  const stringlyKey = [answerRows[0], JSON.stringify(stringly), ...answerRows.slice(2)].join('\n');
  assert.throws(() => parseItems(QUESTIONS, stringlyKey, 50), /multiple_1: accepted values of side1 are not integer; BFCL's variable path is not ported/);
});

// ─── Prompt ──────────────────────────────────────────────────────────────────

test('the prompt is tool selection\'s, with BFCL\'s types written as JSON Schema\'s and names kept', () => {
  assert.equal(SYSTEM, TOOL_SELECTION_SYSTEM);
  const [system, user] = buildMessages(ITEMS[1]);
  assert.deepEqual(system, { role: 'system', content: SYSTEM });
  const [request, tools] = user.content.split('\n\nTools:\n');
  assert.equal(request, `Request: ${ITEMS[1].request}`);
  const shown = JSON.parse(tools);
  assert.deepEqual(shown.map((fn) => fn.name), ITEMS[1].functions.map((fn) => fn.name));
  assert.equal(tools, JSON.stringify(shown, null, 2));
  for (const item of ITEMS) {
    const text = buildMessages(item)[1].content;
    assert.doesNotMatch(text, /"type": "(dict|float|tuple)"/, item.id);
  }
  assert.equal(shown[0].parameters.type, 'object');
});

// ─── Scoring ─────────────────────────────────────────────────────────────────

test('the port gives BFCL\'s own verdict on every answer of the conformance corpus', () => {
  assert.equal(CONFORMANCE.commit, BFCL_COMMIT);
  assert.equal(CONFORMANCE.questions_sha256, QUESTIONS_SHA256);
  assert.equal(CONFORMANCE.answers_sha256, ANSWERS.sha256);
  const byId = new Map(ITEMS.map((item) => [item.id, item]));
  const disagreements = CONFORMANCE.entries.filter((entry) =>
    (checkCall(byId.get(entry.id), entry.tool, entry.arguments) === null) !== entry.valid);
  assert.deepEqual(disagreements.map((entry) => `${entry.id} ${entry.variant}`), []);
  // The corpus has both verdicts for every item, so a port that always says yes or no fails.
  for (const item of ITEMS) {
    const verdicts = new Set(CONFORMANCE.entries.filter((entry) => entry.id === item.id).map((entry) => entry.valid));
    assert.deepEqual([...verdicts].sort(), [false, true], item.id);
  }
});

test('BFCL\'s string normalisation drops spaces and , . / - _ * ^, lowers case and reads \' as "', () => {
  assert.equal(standardize("San Diego, CA"), 'sandiegoca');
  assert.equal(standardize('a-b_c*d^e/f.g'), 'abcdefg');
  assert.equal(standardize("it's"), 'it"s');
});

test('a reply is judged by its last JSON object, with reasoning removed and null arguments left out', () => {
  const item = ITEMS[1];
  const call = { tool: 'math.triangle_area_heron', arguments: { side1: 3, side2: 4, side3: 5 } };
  assert.deepEqual(judge(JSON.stringify(call), item), { correct: true, extracted: JSON.stringify(call) });
  assert.equal(judge(`<think>${JSON.stringify({ tool: 'x' })}</think>Here: ${JSON.stringify(call)}`, item).correct, true);
  const withNull = { ...call, arguments: { ...call.arguments, unknown: null } };
  assert.equal(judge(JSON.stringify(withNull), item).correct, true);
  assert.equal(judge(JSON.stringify({ tool: null, arguments: {} }), item).correct, false);
  assert.equal(judge(JSON.stringify({ tool: 'math.triangle_area_heron', arguments: '{"side1": 3}' }), item).correct, false);
  assert.deepEqual(judge('The area is 6.', item), { correct: false, extracted: null });
});
````

- [ ] **Step 2: Run them to see them fail**

Run: `bun test apps/cli/test/bfcl.test.mjs`
Expected: FAIL with `Cannot find module '../src/eval/bfcl.ts'`.

- [ ] **Step 3: Write the suite module**

Create `apps/cli/src/eval/bfcl.ts`:

````ts
/**
 * BFCL calibration slice, benchmark version 1: the first 50 items of the Berkeley Function
 * Calling Leaderboard's "multiple" category, asked in tool-selection-v1's prompted format and
 * scored by a port of BFCL's own checker (bfcl_eval/eval_checker/ast_eval/ast_checker.py at the
 * pinned commit). The method is published on the benchmark page
 * (apps/web/src/content/benchmarks/bfcl-multiple-50.md); change them together and bump the version.
 */
import type { ChatMessage } from './gsm8k.ts';
import { visibleReply } from './reply.ts';
import { lastJsonObject } from './tool-selection.ts';

/** Recorded in every transcript; bump when the prompt or the scoring rule changes. */
export const PROMPT_VERSION = 'bfcl-multiple-1';

/** New tokens allowed per reply, reasoning included; the same as tool-selection-v1. */
export const MAX_TOKENS = 1024;

/** The system message of tool-selection-v1, word for word, so both benchmarks ask the same way. */
export const SYSTEM = 'You choose and call tools for a user. You are given the user\'s request and a list of tools, '
  + 'each with a JSON Schema for its arguments. Reply with exactly one JSON object and nothing else, in this form: '
  + '{"tool": "<tool name>", "arguments": {"<argument name>": <value>}}. Use only a listed tool and only its '
  + 'parameters. Give every required parameter, and give an optional parameter only when the request asks for a '
  + 'value other than its default. Copy names, paths, identifiers and other values exactly as the request gives '
  + 'them. If none of the listed tools can carry out the request in one call, reply {"tool": null, "arguments": {}}.';

/** The commit of ShishirPatil/gorilla the slice is taken from. */
export const BFCL_COMMIT = 'f7cf7359b7ac615a0b294831c5ba2bc95ee4a000';

/** BFCL's possible answers for the same category, fetched from the same commit and pinned. */
export const ANSWERS = {
  url: `https://raw.githubusercontent.com/ShishirPatil/gorilla/${BFCL_COMMIT}/berkeley-function-call-leaderboard/bfcl_eval/data/possible_answer/BFCL_v4_multiple.json`,
  sha256: '244e00ce9395df948bcafc7bee64e8f9c87ef70887587d83cae45b13699f3047',
};

type BfclType = 'string' | 'integer' | 'float' | 'boolean' | 'array' | 'tuple' | 'dict';

export interface BfclParameter {
  type: BfclType;
  description?: string;
  items?: { type: BfclType };
  properties?: Record<string, BfclParameter>;
  [key: string]: unknown;
}

export interface BfclFunction {
  name: string;
  description: string;
  parameters: { type: 'dict'; properties: Record<string, BfclParameter>; required: string[] };
}

export interface BfclItem {
  id: string;
  request: string;
  functions: BfclFunction[];
  /** The one expected call: its function name and, per parameter, the values BFCL accepts ("" = may be left out). */
  answer: { name: string; params: Record<string, unknown[]> };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const SCALARS: string[] = ['string', 'integer', 'float', 'boolean'];

/** Throws when a parameter uses a type this port does not check the way BFCL does. */
function assertSupported(id: string, fn: BfclFunction): void {
  for (const [name, schema] of Object.entries(fn.parameters.properties)) {
    const where = `${id}: ${fn.name}.${name}`;
    if (schema.type === 'array' || schema.type === 'tuple') {
      if (!SCALARS.includes(String(schema.items?.type))) throw new Error(`${where}: arrays of ${schema.items?.type} are not supported`);
    } else if (!SCALARS.includes(schema.type) && schema.type !== 'dict') {
      throw new Error(`${where}: type ${schema.type} is not supported`);
    }
  }
}

function jsonLines(text: string): unknown[] {
  return text.split('\n').filter((line) => line.trim() !== '').map((line) => JSON.parse(line) as unknown);
}

/** The first `count` items, with the questions and the answers matched by id. */
export function parseItems(questions: string, answers: string, count: number): BfclItem[] {
  const asked = jsonLines(questions);
  const answered = jsonLines(answers);
  if (asked.length < count || answered.length < count) {
    throw new Error(`source has ${Math.min(asked.length, answered.length)} items; the benchmark needs ${count}`);
  }
  return asked.slice(0, count).map((row, index) => {
    const id = `multiple_${index}`;
    const truthRow = answered[index];
    if (!isObject(row) || row.id !== id || !isObject(truthRow) || truthRow.id !== id) throw new Error(`item ${index + 1}: expected id ${id}`);
    const turns = Array.isArray(row.question) ? row.question[0] : undefined;
    const turn = Array.isArray(turns) && turns.length === 1 ? turns[0] : undefined;
    if (!isObject(turn) || turn.role !== 'user' || typeof turn.content !== 'string') throw new Error(`${id}: expected one user message`);
    if (!Array.isArray(row.function) || !row.function.every(isObject)) throw new Error(`${id}: expected a list of functions`);
    // The function descriptions are BFCL's, pinned by hash; assertSupported checks the parts the checker reads.
    const functions: BfclFunction[] = row.function as unknown as BfclFunction[];
    functions.forEach((fn) => assertSupported(id, fn));
    const truth = truthRow.ground_truth;
    const call = Array.isArray(truth) && truth.length === 1 && isObject(truth[0]) ? Object.entries(truth[0]) : [];
    if (call.length !== 1 || !isObject(call[0][1])) throw new Error(`${id}: expected one call`);
    const [name, rawParams] = call[0];
    const params: Record<string, unknown[]> = {};
    for (const [param, accepted] of Object.entries(rawParams)) {
      if (!Array.isArray(accepted)) throw new Error(`${id}: accepted values of ${param} are not a list`);
      params[param] = accepted;
    }
    const fn = functions.find((candidate) => candidate.name === name);
    if (fn === undefined) throw new Error(`${id}: expected function ${name} is not offered`);
    // BFCL checks an accepted value of another type than the schema's by its variable path, which is not ported.
    for (const [param, accepted] of Object.entries(params)) {
      const schema = fn.parameters.properties[param];
      if (schema === undefined) throw new Error(`${id}: ${param} is not a parameter of ${name}`);
      const given = accepted.find((value) => value !== '');
      const itemType = schema.items?.type;
      const isList = schema.type === 'array' || schema.type === 'tuple';
      const fits = (given === undefined || hasType(given, schema.type))
        && (!isList || accepted.every((value) => !Array.isArray(value)
          || (itemType !== undefined && value.every((element) => hasType(element, itemType)))));
      if (!fits) throw new Error(`${id}: accepted values of ${param} are not ${schema.type}; BFCL's variable path is not ported`);
    }
    return { id, request: turn.content, functions, answer: { name, params } };
  });
}

/** BFCL's dict, float and tuple, as JSON Schema says them: object, number and array. */
const SCHEMA_TYPE: Record<string, string> = { dict: 'object', float: 'number', tuple: 'array' };

function toSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toSchema);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [
    key,
    key === 'type' && typeof inner === 'string' ? (SCHEMA_TYPE[inner] ?? inner) : toSchema(inner),
  ]));
}

export function buildMessages(item: BfclItem): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Request: ${item.request}\n\nTools:\n${JSON.stringify(item.functions.map(toSchema), null, 2)}` },
  ];
}

// ─── BFCL's checker, for the types above ─────────────────────────────────────

/** BFCL's string normalisation: spaces and , . / - _ * ^ removed, lower case, ' read as ". */
export function standardize(text: string): string {
  return text.replace(/[ ,./\-_*^]/g, '').toLowerCase().replaceAll("'", '"');
}

/** Python's ==: numbers by value, a boolean as 0 or 1 beside a number, lists and dicts element by element. */
function pyEqual(a: unknown, b: unknown): boolean {
  const numeric = (value: unknown) => typeof value === 'number' || typeof value === 'boolean';
  if (numeric(a) && numeric(b)) return Number(a) === Number(b);
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, index) => pyEqual(value, b[index]));
  if (isObject(a) && isObject(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && pyEqual(a[key], b[key]));
  }
  return a === b;
}
const pyIn = (value: unknown, list: unknown[]) => list.some((entry) => pyEqual(value, entry));
const standardizeIfString = (value: unknown) => (typeof value === 'string' ? standardize(value) : value);

/**
 * Whether a value has the parameter's type. JSON does not tell 2 from 2.0, so a whole number
 * counts as a float wherever a float is expected (BFCL itself turns an int into a float there),
 * and a number counts as an integer only when it is whole.
 */
function hasType(value: unknown, type: BfclType): boolean {
  switch (type) {
    case 'string': return typeof value === 'string';
    case 'integer': return typeof value === 'number' && Number.isInteger(value);
    case 'float': return typeof value === 'number';
    case 'boolean': return typeof value === 'boolean';
    case 'array':
    case 'tuple': return Array.isArray(value);
    case 'dict': return isObject(value);
  }
}

/**
 * BFCL's type check. For a list, the elements are checked against the item type, unless one of
 * the accepted values is not itself a list (such as "" for "may be left out"): BFCL then skips them.
 */
function typeChecks(value: unknown, schema: BfclParameter, accepted: unknown[]): boolean {
  if (!hasType(value, schema.type)) return false;
  if (schema.type !== 'array' && schema.type !== 'tuple') return true;
  if (accepted.some((entry) => !Array.isArray(entry))) return true;
  const itemType = schema.items?.type;
  return itemType !== undefined && Array.isArray(value) && value.every((element) => hasType(element, itemType));
}

/** BFCL's list check: strings in both lists normalised, then compared as Python lists. */
function listChecks(value: unknown[], accepted: unknown[]): boolean {
  const model = value.map(standardizeIfString);
  const options = accepted.map((entry) => (Array.isArray(entry) ? entry : [...String(entry)]).map(standardizeIfString));
  return pyIn(model, options);
}

/** BFCL's dict check: every given key known with an accepted value, every key it needs given. */
function dictChecks(value: Record<string, unknown>, accepted: unknown[]): boolean {
  return accepted.some((entry) => {
    if (entry === '' || !isObject(entry)) return false;
    for (const [key, given] of Object.entries(value)) {
      if (!Object.hasOwn(entry, key)) return false;
      const options = entry[key];
      if (!Array.isArray(options) || !pyIn(standardizeIfString(given), options.map(standardizeIfString))) return false;
    }
    return Object.entries(entry).every(([key, options]) => Object.hasOwn(value, key) || (Array.isArray(options) && options.includes('')));
  });
}

/**
 * BFCL's verdict on one call to an item of the "multiple" category, in Python, with the
 * expected function's description: the error type it would report, or null when the call is valid.
 */
export function checkCall(item: BfclItem, tool: string, args: Record<string, unknown>): string | null {
  if (tool !== item.answer.name) return 'wrong_func_name';
  const fn = item.functions.find((candidate) => candidate.name === tool);
  if (fn === undefined) return 'wrong_func_name';
  const { properties, required } = fn.parameters;
  for (const name of required) if (!Object.hasOwn(args, name)) return 'missing_required';
  for (const [name, value] of Object.entries(args)) {
    if (!Object.hasOwn(properties, name) || !Object.hasOwn(item.answer.params, name)) return 'unexpected_param';
    const schema = properties[name];
    const accepted = item.answer.params[name];
    if (!typeChecks(value, schema, accepted)) return 'type_error';
    let ok: boolean;
    if (schema.type === 'dict') ok = isObject(value) && dictChecks(value, accepted);
    else if (schema.type === 'string') ok = typeof value === 'string' && accepted.some((entry) => typeof entry === 'string' && standardize(entry) === standardize(value));
    else if (schema.type === 'array' || schema.type === 'tuple') ok = Array.isArray(value) && listChecks(value, accepted);
    else ok = pyIn(value, accepted);
    if (!ok) return 'value_error';
  }
  for (const [name, accepted] of Object.entries(item.answer.params)) {
    if (!Object.hasOwn(args, name) && !accepted.includes('')) return 'missing_optional';
  }
  return null;
}

/**
 * The answer is the last JSON object in the visible reply, as in tool-selection-v1. Its `tool`
 * must be a function name; its `arguments`, an object, with null values counting as left out.
 */
export function judge(reply: string, item: BfclItem): { correct: boolean; extracted: string | null } {
  const answer = lastJsonObject(visibleReply(reply));
  if (answer === null) return { correct: false, extracted: null };
  const raw = answer.arguments ?? {};
  const extracted = JSON.stringify(answer);
  if (typeof answer.tool !== 'string' || !isObject(raw)) return { correct: false, extracted };
  const args = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== null));
  return { correct: checkCall(item, answer.tool, args) === null, extracted };
}
````

- [ ] **Step 4: Run the tests and the type check**

Run: `bun test apps/cli/test/bfcl.test.mjs && bun run typecheck`
Expected: 7 pass, 0 fail, including `the port gives BFCL's own verdict on every answer of the conformance corpus`; 0 type errors.

- [ ] **Step: Commit**

Subject: `feat(eval): BFCL suite with a port of BFCL's checker, held to BFCL's verdicts`. Files: `apps/cli/src/eval/bfcl.ts`, `apps/cli/test/bfcl.test.mjs`.

---

### Task 3: Second pinned source in the runner, registration, page and lists

**Files:**
- Modify: `apps/cli/src/eval/suites.ts`, `apps/cli/src/eval/run.ts`
- Create: `apps/web/src/content/benchmarks/bfcl-multiple-50.md`
- Modify: `.github/ISSUE_TEMPLATE/submit-eval-result.yml`
- Test: `apps/cli/test/bfcl.test.mjs`, `apps/web/test/evals-pages.test.mjs`

- [ ] **Step 1: Write the failing tests**

In `apps/cli/test/bfcl.test.mjs`, replace everything above the line `// ─── Source ───…` with:

````js
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { repeatProblems } from '@unite4ai/core/repeat';
import { validateContent } from '@unite4ai/core/validate';
import { SYSTEM as TOOL_SELECTION_SYSTEM } from '../../../scripts/benchmarks/tool-selection.mjs';
import { ANSWERS, BFCL_COMMIT, SYSTEM, buildMessages, checkCall, judge, parseItems, standardize } from '../src/eval/bfcl.ts';
import { runEval } from '../src/eval/run.ts';
import { SUITES } from '../src/eval/suites.ts';

const FIXTURES = fileURLToPath(new URL('./fixtures/bfcl/', import.meta.url));
const CONTENT_ROOT = fileURLToPath(new URL('../../web/src/content', import.meta.url));
const DEFINITION = join(CONTENT_ROOT, 'benchmarks/bfcl-multiple-50.md');
const QUESTIONS_FILE = join(FIXTURES, 'BFCL_v4_multiple.json');
const ANSWERS_FILE = join(FIXTURES, 'BFCL_v4_multiple_possible_answer.json');
const QUESTIONS_SHA256 = 'aef168155ebd74b7ac2401198b201343bc7d16d7a3d7e0d4e6d8ee82c6969b2a';
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const QUESTIONS = readFileSync(QUESTIONS_FILE, 'utf8');
const ANSWER_KEY = readFileSync(ANSWERS_FILE, 'utf8');
const ITEMS = parseItems(QUESTIONS, ANSWER_KEY, 50);
const CONFORMANCE = JSON.parse(readFileSync(join(FIXTURES, 'conformance.json'), 'utf8'));
````

and append at the end of the file:

````js
// ─── Suite, page and runner ──────────────────────────────────────────────────

test('the suite reads both pinned files and needs the answers', () => {
  const suite = SUITES['bfcl-multiple-50'];
  assert.deepEqual(suite.answers, ANSWERS);
  assert.equal(suite.items(QUESTIONS, 50, ANSWER_KEY).length, 50);
  assert.throws(() => suite.items(QUESTIONS, 50), /needs its answers file/);
});

test('the benchmark page pins both files and the method the suite runs', () => {
  const definition = readFileSync(DEFINITION, 'utf8');
  assert.match(definition, new RegExp(`^source_sha256: ${QUESTIONS_SHA256}$`, 'm'));
  assert.match(definition, new RegExp(`^source_url: https://raw\\.githubusercontent\\.com/ShishirPatil/gorilla/${BFCL_COMMIT}/`, 'm'));
  assert.ok(definition.includes(ANSWERS.sha256), 'the page names the answers file\'s hash');
  assert.match(definition, /^items: 50$/m);
  assert.match(definition, /^license: apache-2\.0$/m);
  assert.match(definition, /^repeat:\n {2}runs: 5\n {2}temperature: 0\.7\n {2}top_p: 1$/m);
  assert.ok(definition.includes(`${CONFORMANCE.entries.length} answers`), 'the page states the size of the conformance corpus');
});

const MODEL_CARD = `---
name: Model A
summary: Fixture model used only in tests.
maintainers: ["tester"]
license: mit
openness:
  weights: open
  training_data: open
  training_code: open
  evaluation: open
updated: 2026-11-01
---

## Notes

Fixture.
`;

const temps = [];
const servers = [];
after(() => {
  servers.forEach((server) => server.close());
  temps.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

/** A model that gives the canonical call on even items and calls the wrong function on odd ones. */
function stubServer() {
  const byRequest = new Map(ITEMS.map((item) => [item.request, item]));
  const bodies = [];
  return new Promise((done) => {
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        const json = (code, payload) => {
          res.statusCode = code;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(payload));
        };
        if (req.url === '/v1/models') return json(200, { data: [{ id: 'stub-model' }] });
        if (req.method !== 'POST' || req.url !== '/v1/chat/completions') return json(404, { error: 'not found' });
        const parsed = JSON.parse(body);
        bodies.push(parsed);
        const request = parsed.messages[1].content.split('\n\nTools:\n')[0].slice('Request: '.length);
        const item = byRequest.get(request);
        if (!item) return json(500, { error: { message: 'stub: not an item as published' } });
        const even = Number(item.id.split('_')[1]) % 2 === 0;
        const canonical = CONFORMANCE.entries.find((entry) => entry.id === item.id && entry.variant === (even ? 'canonical' : 'wrong_function'));
        const answer = JSON.stringify({ tool: canonical.tool, arguments: canonical.arguments });
        res.setHeader('content-type', 'text/event-stream');
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: answer }, finish_reason: null }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 700, completion_tokens: 40 } })}\n\n`);
        res.end('data: [DONE]\n\n');
      });
    });
    servers.push(server);
    server.listen(0, '127.0.0.1', () => done({ baseUrl: `http://127.0.0.1:${server.address().port}/v1`, bodies }));
  });
}

/** Runs `fn` with every request to another machine refused: the tests never fetch BFCL's files. */
async function offline(fn) {
  const real = globalThis.fetch;
  const refused = [];
  globalThis.fetch = (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (new URL(url).hostname === '127.0.0.1') return real(input, init);
    refused.push(url);
    return Promise.reject(new Error(`a test must not use the network: ${url}`));
  };
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
}

test('a run reads both pinned files from the cache, sends each item five times, and publishes a result the gate accepts', { timeout: 120_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'u4ai-bfcl-'));
  temps.push(root);
  const contentRoot = join(root, 'content');
  for (const dir of ['models', 'benchmarks', 'evals']) mkdirSync(join(contentRoot, dir), { recursive: true });
  writeFileSync(join(contentRoot, 'models/model-a.md'), MODEL_CARD);
  copyFileSync(DEFINITION, join(contentRoot, 'benchmarks/bfcl-multiple-50.md'));
  const workDir = join(root, 'work');
  mkdirSync(join(workDir, 'cache'), { recursive: true });
  copyFileSync(QUESTIONS_FILE, join(workDir, 'cache', `${QUESTIONS_SHA256}.txt`));
  copyFileSync(ANSWERS_FILE, join(workDir, 'cache', `${ANSWERS.sha256}.txt`));
  const stub = await stubServer();

  const outcome = await offline(() => runEval({
    benchmark: 'bfcl-multiple-50',
    model: 'model-a',
    servedModel: 'stub-model',
    submitter: 'alice',
    runtime: 'mlx-lm',
    runtimeVersion: '0.32.2',
    format: 'mlx',
    quantization: '4bit',
    baseUrl: stub.baseUrl,
    contentRoot,
    workDir,
    command: 'bun run eval -- --benchmark bfcl-multiple-50 --model model-a',
    hardware: { device: 'Test Box', accelerator: 'cpu', memory_gb: 16 },
    today: '2026-11-22',
  }));

  assert.equal(stub.bodies.length, 250);
  assert.deepEqual(stub.bodies.map((body) => [body.seed, body.temperature, body.top_p, body.max_tokens]),
    Array.from({ length: 250 }, (_, position) => [position, 0.7, 1, 1024]));
  assert.deepEqual([outcome.n, outcome.runs, outcome.correct, outcome.score], [50, 5, 25, 50]);
  const [header] = readFileSync(outcome.transcriptPath, 'utf8').split('\n').map((line) => (line ? JSON.parse(line) : null));
  assert.equal(header.answers_sha256, ANSWERS.sha256);
  const result = JSON.parse(readFileSync(outcome.resultPath, 'utf8'));
  assert.deepEqual(result.repeat.item_pass_histogram, [25, 0, 0, 0, 0, 25]);
  assert.deepEqual(repeatProblems(result.repeat, result.n), []);
  assert.deepEqual((await validateContent(contentRoot)).errors, []);
});
````

In `apps/web/test/evals-pages.test.mjs`, in `model page lists its evaluations and local setups; the feed publishes the groups`:

1. Add `['bfcl-multiple-50', '1', []],` as the first row of the `feed.benchmarks` list (Quality is ordered by name; "BFCL…" sorts first), and `'bfcl-multiple-50': { runs: 5, temperature: 0.7, top_p: 1 },` as the first entry of the `repeat` map.
2. The test read GSM8K as `feed.benchmarks[0]`, which is no longer true. Replace `assert.equal(feed.benchmarks[0].higher_is_better, true);` with:

````js
  const gsm8k = feed.benchmarks.find((b) => b.id === 'gsm8k-200');
  assert.equal(gsm8k.higher_is_better, true);
````

   and `const current = quality.filter((g) => g.benchmark_version === feed.benchmarks[0].version);` with `const current = quality.filter((g) => g.benchmark_version === gsm8k.version);`.

- [ ] **Step 2: Run them to see them fail**

Run: `bun test apps/cli/test/bfcl.test.mjs apps/web/test/evals-pages.test.mjs`
Expected: FAIL: `SUITES['bfcl-multiple-50']` is undefined, the page file is missing, the feed lacks the benchmark.

- [ ] **Step 3: Let a suite name a second pinned file**

In `apps/cli/src/eval/suites.ts`, replace the `items(source: string, count: number): SuiteItem[];` member of `Suite` and its doc comment with:

````ts
  /**
   * Builds the items from the pinned source text, and from the pinned answers when the suite
   * names an `answers` file; throws when the source does not fit.
   */
  items(source: string, count: number, answers?: string): SuiteItem[];
  /** A second pinned file the items need, such as an answer key published apart from the questions. */
  answers?: { url: string; sha256: string };
````

In `apps/cli/src/eval/run.ts`, replace the two lines that load the source and build the items (`const source = await loadSource(…` and `const items = suite.items(source, definition.items);`) with:

````ts
  const source = await loadSource(options, definition.source_url, definition.source_sha256, suite.localSource);
  // A file the caller names stands in for the source only; the answers come from the cache or the network.
  const answers = suite.answers === undefined
    ? undefined
    : await loadSource({ ...options, sourceFile: undefined }, suite.answers.url, suite.answers.sha256, undefined);
  const items = suite.items(source, definition.items, answers);
````

and in the transcript header, replace the `source_sha256: definition.source_sha256,` line with:

````ts
    source_sha256: definition.source_sha256,
    // Only a suite with an answers file adds this, so other transcripts keep their names and resume.
    ...(suite.answers === undefined ? {} : { answers_sha256: suite.answers.sha256 }),
````

- [ ] **Step 4: Register the suite**

In `apps/cli/src/eval/suites.ts`, add `import * as bfcl from './bfcl.ts';` as the first import; after the `toolSelectionSuite` suite add:

````ts
const bfclMultiple: Suite = {
  promptVersion: bfcl.PROMPT_VERSION,
  maxTokens: bfcl.MAX_TOKENS,
  answers: bfcl.ANSWERS,
  items: (source, count, answers) => {
    if (answers === undefined) throw new Error('bfcl-multiple-50 needs its answers file');
    return bfcl.parseItems(source, answers, count).map((item, index) => ({
      index,
      messages: bfcl.buildMessages(item),
      expected: JSON.stringify(item.answer),
      judge: (reply) => bfcl.judge(reply, item),
    }));
  },
};
````

and add `'bfcl-multiple-50': bfclMultiple,` as the last entry of `SUITES`.

- [ ] **Step 5: Write the benchmark page**

Create `apps/web/src/content/benchmarks/bfcl-multiple-50.md`:

````markdown
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
````

- [ ] **Step 6: Offer the benchmark on the result form**

In `.github/ISSUE_TEMPLATE/submit-eval-result.yml`, add `        - bfcl-multiple-50` after `        - tool-selection-v1`.

- [ ] **Step 7: Run the tests, the type check and the content gate**

Run: `bun test apps/cli/test apps/web/test/evals-pages.test.mjs apps/web/test/issue-templates.test.mjs && bun run typecheck && bun run validate && bun run check`
Expected: all pass (10 in `bfcl.test.mjs`); 0 type errors; `validate` 0 errors; `astro check` 0 errors.

- [ ] **Step: Commit**

Subject: `feat(benchmarks): bfcl-multiple-50, with the answers file as a second pinned source`. Files: `apps/cli/src/eval/suites.ts`, `apps/cli/src/eval/run.ts`, `apps/web/src/content/benchmarks/bfcl-multiple-50.md`, `.github/ISSUE_TEMPLATE/submit-eval-result.yml`, `apps/cli/test/bfcl.test.mjs`, `apps/web/test/evals-pages.test.mjs`.

---

### Task 4: Contributor docs

**Files:**
- Modify: `CONTRIBUTING.md`

- [ ] **Step 1: Edit the text**

Replace

````markdown
The runner does the bookkeeping for you. Runnable benchmarks today: `gsm8k-200` and
`tool-selection-v1` (quality) and `canary-injection-v1` (security). Point it at any
OpenAI-compatible local server (mlx-lm, Ollama, llama.cpp, vLLM):
````

with

````markdown
The runner does the bookkeeping for you. Runnable benchmarks today: `gsm8k-200`,
`tool-selection-v1` and `bfcl-multiple-50` (quality) and `canary-injection-v1` (security).
Point it at any OpenAI-compatible local server (mlx-lm, Ollama, llama.cpp, vLLM):
````

and after the paragraph about `tool-selection-v1` (ending `longer than the canary's.`) add:

````markdown
`bfcl-multiple-50` asks 50 items of the Berkeley Function Calling Leaderboard in the same
format, five times each (250 replies). The runner downloads BFCL's question and answer files
from GitHub on the first run, checks both against their pinned hashes and keeps them in
`.agent/evals/cache/`; later runs work offline. Its scorer is a port of BFCL's checker. To
compare a run's verdicts with BFCL's own checker, run
`python3 scripts/benchmarks/bfcl_crosscheck.py transcript <the run's transcript>` (Python 3,
standard library only); it lists every answer where the two disagree.
````

- [ ] **Step 2: Commit**

Subject: `docs: bfcl-multiple-50 in the contributor guide`. Files: `CONTRIBUTING.md`.

---

### Task 5: Gate and pull request

- [ ] **Step 1: Run the acceptance gate**

Run: `source scripts/agent/activate-node.sh && node scripts/agent/verify.mjs`
Expected: last line is JSON with `"status":"pass"`.

- [ ] **Step 2: Open the pull request**

```bash
git push -u origin bfcl-calibration
gh-axi pr create --base main --head bfcl-calibration --title "feat: bfcl-multiple-50 calibration slice (agent evidence plan 3)" \
  --body "Plan: docs/superpowers/plans/2026-11-22-bfcl-calibration.md. First 50 BFCL 'multiple' items in tool-selection format, scored by a port of BFCL's checker that reproduces BFCL's verdict on all 463 answers of a committed corpus; the answers file is a second pinned source. No model was run. Gate: pass."
```

Do not merge. The owner reviews.
