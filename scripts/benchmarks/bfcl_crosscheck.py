#!/usr/bin/env python3
"""Score bfcl-multiple-50 answers with BFCL's own checker, to calibrate Unite4AI's port of it.

BFCL's checker (bfcl_eval/eval_checker/ast_eval/ast_checker.py) is fetched at the pinned commit
and checked against its hash. Transcript mode also needs Bun to replay the local scorer.

  corpus      Build synthetic answers for every item (right ones, and the near misses a model
              makes), score them with BFCL's checker, and write the verdicts to
              apps/cli/test/fixtures/bfcl/conformance.json. A test replays them through the port.
  transcript  Validate and replay a complete BFCL v1 transcript, then score with BFCL's checker.
              Print the disagreements as text (default), or with --json emit a report without dialogue.
  review-result  Compare a local BFCL v1 result with a private transcript without network access.

Usage:
  python3 scripts/benchmarks/bfcl_crosscheck.py corpus
  python3 scripts/benchmarks/bfcl_crosscheck.py transcript .agent/evals/<transcript>.jsonl
  python3 scripts/benchmarks/bfcl_crosscheck.py transcript .agent/evals/<transcript>.jsonl --json
  python3 scripts/benchmarks/bfcl_crosscheck.py review-result RESULT.json TRANSCRIPT.jsonl

Answers travel as JSON, which cannot tell 2 from 2.0. Before BFCL's checker sees an answer, a
whole number where the schema expects a float is made a float, as the published method states.
"""
import argparse
import enum
import hashlib
import json
import re
import subprocess
import sys
import types
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMMIT = "f7cf7359b7ac615a0b294831c5ba2bc95ee4a000"
BASE = f"https://raw.githubusercontent.com/ShishirPatil/gorilla/{COMMIT}/berkeley-function-call-leaderboard/bfcl_eval"
CHECKER = (f"{BASE}/eval_checker/ast_eval/ast_checker.py", "2aae7a68461a8f76c0be3894c8901b66b56967a1989d3ab066051e3fb97f1538")
QUESTIONS = (f"{BASE}/data/BFCL_v4_multiple.json", "aef168155ebd74b7ac2401198b201343bc7d16d7a3d7e0d4e6d8ee82c6969b2a")
ANSWERS = (f"{BASE}/data/possible_answer/BFCL_v4_multiple.json", "244e00ce9395df948bcafc7bee64e8f9c87ef70887587d83cae45b13699f3047")
FIXTURES = ROOT / "apps/cli/test/fixtures/bfcl"
REPLAY = Path(__file__).with_name("bfcl-replay.ts").resolve()
COUNT = 50
RUNS = 5
ATTEMPTS = COUNT * RUNS
REPEAT = {"runs": RUNS, "temperature": 0.7, "top_p": 1}
TRANSCRIPT_HEADER = {
    "type": "header",
    "benchmark": "bfcl-multiple-50",
    "benchmark_version": "1",
    "prompt_version": "bfcl-multiple-1",
    "source_sha256": QUESTIONS[1],
    "answers_sha256": ANSWERS[1],
    "max_tokens": 1024,
}
MODEL = "unite4ai"


def pinned(url_and_hash, local=None):
    """Hash-check a committed fixture, or fetch and hash-check the pinned upstream checker."""
    url, digest = url_and_hash
    data = local.read_bytes() if local is not None else urllib.request.urlopen(url, timeout=60).read()
    actual = hashlib.sha256(data).hexdigest()
    if actual != digest:
        sys.exit(f"hash mismatch for {local if local is not None else url}: expected {digest}, got {actual}")
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


def fixture_sources():
    return (
        pinned(QUESTIONS, FIXTURES / "BFCL_v4_multiple.json"),
        pinned(ANSWERS, FIXTURES / "BFCL_v4_multiple_possible_answer.json"),
    )


def items(questions_text, answers_text):
    questions = [json.loads(line) for line in questions_text.splitlines() if line.strip()]
    answers = [json.loads(line) for line in answers_text.splitlines() if line.strip()]
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
    for item in items(*fixture_sources()):
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


def complete(record):
    if not isinstance(record, dict) or record.get("type") != "complete" or not isinstance(record.get("date"), str):
        return False
    try:
        return date.fromisoformat(record["date"]).isoformat() == record["date"]
    except ValueError:
        return False


def read_transcript(path):
    raw = Path(path).read_bytes()
    # Only LF separates records; a raw reply may contain other Unicode line separators.
    lines = raw.decode("utf-8").split("\n")
    if lines[-1] == "":
        lines.pop()
    if not lines:
        raise ValueError("missing the bfcl-multiple-50 transcript header")
    header = json.loads(lines[0])
    if not isinstance(header, dict):
        raise ValueError("invalid bfcl-multiple-50 transcript header")
    for field, expected in TRANSCRIPT_HEADER.items():
        if header.get(field) != expected:
            raise ValueError(f"transcript header {field}: expected {expected}")
    method = header.get("repeat")
    if method != REPEAT or isinstance(method["top_p"], bool):
        raise ValueError(f"transcript header repeat: expected {REPEAT}")
    if len(lines) != ATTEMPTS + 2:
        raise ValueError(f"expected a header, {ATTEMPTS} answers and a complete footer")
    footer = json.loads(lines[-1])
    if not complete(footer):
        raise ValueError("expected a complete footer with a YYYY-MM-DD date")

    answers = []
    for seed, line in enumerate(lines[1:-1]):
        record = json.loads(line)
        run, index = divmod(seed, COUNT)
        where = f"run {run} item {index} seed {seed}"
        if (not isinstance(record, dict) or record.get("type") != "item"
                or any(type(record.get(key)) is not int or record[key] != value
                       for key, value in (("run", run), ("index", index), ("seed", seed)))):
            raise ValueError(f"expected answer in order at {where}")
        if not isinstance(record.get("reply"), str):
            raise ValueError(f"expected raw reply text at {where}")
        prompt_hash = record.get("prompt_sha256")
        if not isinstance(prompt_hash, str) or re.fullmatch(r"[0-9a-f]{64}", prompt_hash) is None:
            raise ValueError(f"expected a 64-hex prompt_sha256 at {where}")
        if "finish_reason" not in record or (record["finish_reason"] is not None
                                              and not isinstance(record["finish_reason"], str)):
            raise ValueError(f"expected finish_reason text or null at {where}")
        tokens = record.get("completion_tokens")
        if "completion_tokens" not in record or (tokens is not None and (type(tokens) is not int or tokens < 0)):
            raise ValueError(f"expected completion_tokens as a non-negative integer or null at {where}")
        if type(record.get("correct")) is not bool or "extracted" not in record:
            raise ValueError(f"expected correct and extracted answer fields at {where}")
        if record["extracted"] is not None and not isinstance(record["extracted"], str):
            raise ValueError(f"expected extracted JSON text or null at {where}")
        answers.append(record)
    return {"sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)}, header, footer["date"], answers


def verify_replay(questions, answers, attempts, review=None):
    payload = {"questions": questions, "answers": answers, "count": COUNT, "attempts": attempts}
    if review is not None:
        payload["review"] = review
    replay = subprocess.run(
        ["bun", str(REPLAY)],
        input=json.dumps(payload, allow_nan=False),
        text=True, stdout=subprocess.PIPE if review is not None else subprocess.DEVNULL, stderr=subprocess.PIPE,
    )
    if replay.returncode != 0:
        raise ValueError(replay.stderr.strip() or "Bun could not replay the pinned BFCL suite")
    return replay.stdout


def transcript(path, json_report=False):
    try:
        evidence, _, _, attempts = read_transcript(path)
        questions, answers = fixture_sources()
        verify_replay(questions, answers, attempts)
    except (OSError, ValueError) as error:
        sys.exit(f"{path}: {error}")

    transcript_sha256 = evidence["sha256"]
    by_index = items(questions, answers)
    upstream = None
    agreement = []
    disagreements = []
    for seed, attempt in enumerate(attempts):
        run, index = divmod(seed, COUNT)
        item = by_index[index]
        ours = attempt["correct"]
        extracted = attempt["extracted"]
        answer = json.loads(extracted) if extracted is not None else None
        tool = answer.get("tool") if answer is not None else None
        arguments = answer.get("arguments") if answer is not None else None
        if arguments is None:
            arguments = {}
        if isinstance(tool, str) and isinstance(arguments, dict):
            if upstream is None:
                upstream = load_checker()
            valid, error_type = bfcl_verdict(*upstream, item, tool, arguments)
        else:
            valid, error_type = False, "no_call"
        agreement.append(valid == ours)
        if not agreement[-1]:
            disagreements.append((run, item["id"], ours, valid, error_type))

    if json_report:
        print(json.dumps({"transcript_sha256": transcript_sha256, "agreement": agreement}))
    else:
        print(f"{sum(agreement)} of {ATTEMPTS} answers scored the same by BFCL's checker and the port")
        for run, item_id, ours, theirs, error_type in disagreements:
            print(f"run {run} {item_id}: port {'right' if ours else 'wrong'}, BFCL {'right' if theirs else 'wrong'} ({error_type})")
    return 1 if disagreements else 0


def review_result(result_path, transcript_path):
    try:
        evidence, header, completed_on, attempts = read_transcript(transcript_path)
        result = Path(result_path).read_bytes()
        questions, answers = fixture_sources()
        report = verify_replay(questions, answers, attempts, {
            "transcript": evidence, "header": header, "date": completed_on,
            "result_text": result.decode("utf-8"), "result_sha256": hashlib.sha256(result).hexdigest(),
        })
    except OSError:
        sys.exit("could not read local evidence or start Bun")
    except (json.JSONDecodeError, UnicodeError):
        sys.exit("expected UTF-8 JSON evidence")
    except ValueError as error:
        sys.exit(str(error))
    sys.stdout.write(report)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("corpus", help="regenerate fixture conformance verdicts")
    transcript_parser = commands.add_parser("transcript", help="cross-check a complete 250-answer transcript")
    transcript_parser.add_argument("path")
    transcript_parser.add_argument("--json", action="store_true", help="emit the transcript hash and agreement vector")
    review_parser = commands.add_parser("review-result", help="review local result and transcript consistency offline")
    review_parser.add_argument("result")
    review_parser.add_argument("transcript")
    options = parser.parse_args()
    if options.command == "corpus":
        corpus()
    elif options.command == "review-result":
        review_result(options.result, options.transcript)
    else:
        sys.exit(transcript(options.path, options.json))
