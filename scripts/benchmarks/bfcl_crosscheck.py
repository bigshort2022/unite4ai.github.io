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
    data = local.read_bytes() if local is not None and local.exists() else urllib.request.urlopen(url, timeout=60).read()
    actual = hashlib.sha256(data).hexdigest()
    if actual != digest:
        sys.exit(f"hash mismatch for {url}: expected {digest}, got {actual}")
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
    return result["valid"], result.get("error_type")


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
    checker, language = load_checker()
    by_index = items()
    lines = [json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()]
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
