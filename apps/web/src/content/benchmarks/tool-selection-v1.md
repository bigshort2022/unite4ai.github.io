---
name: Tool selection
summary: A hundred requests, each with 8 to 16 tools to choose from. The score is the share of requests answered with exactly the right call, or correctly with no call, on all five runs.
category: quality
version: "1"
metric:
  name: correct on every run
  unit: "%"
  higher_is_better: true
  min: 0
  max: 100
scoring: exact-match
items: 100
repeat:
  runs: 5
  temperature: 0.7
  top_p: 1
source_url: https://unite4ai.com/data/benchmarks/tool-selection-v1.jsonl
source_sha256: 95b3bd6a0e5087f8e44bfa1ba14b7faaef3d0a4ed9dfd6b64184a21d257de3db
license: cc-by-4.0
updated: 2026-11-22
---

## What it measures

Whether a model, given a request and a list of tools, picks the one right tool and fills in
its arguments exactly, and whether it declines when no listed tool fits. This is the first
step of most agent actions, and a common way for them to go wrong: calling a tool that looks
right but is not, inventing an argument, or acting when it should not.

Every item offers all the tools of one domain, so the wrong answers are near misses:
`write_file` beside `append_file`, `create_event` beside `update_event`, `send_message`
beside `reply_message` and `send_email`, `git_checkout` beside `git_create_branch`. The rest
of the list comes from other domains. Fifteen items have no correct call: the tool the
request needs is left out while its near misses stay, so the right answer is to call nothing.

## Method

Every item is its own conversation of two messages. The system message is the same for all
hundred:

```text
You choose and call tools for a user. You are given the user's request and a list of tools, each with a JSON Schema for its arguments. Reply with exactly one JSON object and nothing else, in this form: {"tool": "<tool name>", "arguments": {"<argument name>": <value>}}. Use only a listed tool and only its parameters. Give every required parameter, and give an optional parameter only when the request asks for a value other than its default. Copy names, paths, identifiers and other values exactly as the request gives them. If none of the listed tools can carry out the request in one call, reply {"tool": null, "arguments": {}}.
```

The user message is `Request: `, the request, a blank line, `Tools:`, a newline, and the
item's tools as JSON indented by two spaces. Each tool has a `name`, a `description` and a
JSON Schema under `parameters`; optional parameters may carry a `default`.

1. An evaluation must use the pinned file at `source_url` and check it against
   `source_sha256`. It has 100 lines; each is one item with its `system` message, `request`,
   `tools` and `expected` call.
2. Each of the 100 items is sent five times: five runs, each one full pass over the items in
   file order, one request at a time. Every request uses temperature 0.7, top-p 1 and at most
   1024 new tokens, and carries a seed equal to its position (run × 100 + item, both counted
   from 0). Whether the server honours the seed is not checked.
3. The **visible reply** is the reply with the model's reasoning removed: a `<think>` block,
   whether or not it is closed, and anything before a `</think>` that has no opening tag.
4. The **answer** is the last JSON object in the visible reply: of the spans from `{` to `}`
   that parse as an object under strict JSON (no single quotes, trailing commas or comments),
   the one that ends last, taken as wide as it parses. Text, code fences or an enclosing array
   around it do not matter, and keys other than `tool` and `arguments` are ignored. A reply
   with no JSON object is wrong.
5. An answer to an item with a correct call is **correct** when all of these hold:
   - its `tool` is the expected tool's name, exactly;
   - its `arguments` name only that tool's parameters;
   - every argument the request sets is present with its value: strings equal after trimming
     whitespace at either end, integers equal as numbers (a number written as a string is wrong),
     booleans equal;
   - every parameter the request does not set is left out or given its default.
6. An answer to an item with no correct call is correct when its `tool` is `null` and its
   `arguments` are left out or empty.

   In rules 5 and 6, an argument whose value is `null`, and an `arguments` of `null`, count as
   left out.
7. The **score** is the percentage of the 100 items answered correctly on all five runs.
   Every result also gives pass@1, the percentage of the 500 answers that were correct; how
   many items each run got right; and the sample standard deviation of the five run scores.
   All five runs must finish: partial runs are not accepted.
8. **Intervals** count items, not answers. The score has a 95% Wilson interval over the 100
   items; pass@1 has a 95% percentile bootstrap interval over items (2,000 resamples, the
   mulberry32 generator, seed 20261122). The content gate recomputes both from the published
   counts.

The items are generated from a fixed seed by `scripts/benchmarks/tool-selection.mjs`: six
domains (files, web, calendar, git, messaging, tickets) of 4 to 7 tools each, request
templates per tool, and pools of values. Every request is unique among the calls, and among
the items with no call. The data file is generated from the script and checked in.

## Tool-only reference floors

These strategies choose only a tool name (or no call). A correct choice is given the gold
arguments, so the numbers do not measure full-call performance.

| Strategy | pass@1 | pass@5 (all five) |
| --- | ---: | ---: |
| Uniform random | 7.9635% | 0.000486% |
| Always first listed tool | 15/100 (15%) | 15/100 (15%) |

Random choice includes no call on every item, so the chance of a correct choice is
`p = 1 / (tools.length + 1)`, including when no call is correct. The expected pass@1 is
the mean of `p` across items; pass@5 is the mean of `p⁵`, with independent choices each
run. The deterministic first-tool choice never abstains and gets the same items right
on every run. `bun scripts/benchmarks/baseline-floors.ts` computes both from the
SHA-256-verified local inputs without sampling or running a model.

## Known weaknesses

- **Synthetic.** The tools, requests and values are written for this benchmark. Real tool
  catalogues are larger, messier and less consistently described; a high score here does not
  show that a model will choose well among a real server's tools.
- **One prompted format.** Tools are given as JSON in the prompt and the answer is a JSON
  object in the text. Models trained for native tool calling may do better or worse through
  their server's tool interface, which this version does not test. `arguments` must be a JSON
  object; a JSON-encoded string, as some tool-calling formats use, is wrong.
- **Exact values.** Values must be copied exactly. A model that writes `14:15:00` for
  `14:15` or `"3"` for `3` is wrong, even though a forgiving tool might accept it.
- **Small and templated.** With 100 items the score's 95% interval spans about 16 points
  near 80% (71 to 87 for 80 of 100). Items built from the same template are not independent,
  so the true uncertainty is if anything larger.
- **Sampling makes runs differ.** At temperature 0.7 two runs of the same setup can
  disagree; that is what the score measures. On a server that ignores the seed, a rerun gives
  other answers and can give another score.
- **No-call items are few.** Fifteen items cannot tell a model that rarely declines from one
  that never does by much, and none of them is in the web domain; read the per-item transcript
  when that matters.
- **Public.** Models can be tuned against it. When results suggest the items have leaked or
  the benchmark is saturated, a new version with a new seed replaces it.
- English only.

## Licence

Written for Unite4AI and released under CC BY 4.0.
