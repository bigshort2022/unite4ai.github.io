---
pretty_name: "Unite4AI BFCL Multiple 50 (v1)"
license: apache-2.0
language:
  - en
size_categories:
  - n<1K
configs:
  - config_name: default
    data_files:
      - split: test
        path: data/test.jsonl
dataset_info:
  config_name: default
  features:
    - name: id
      dtype: string
    - name: system
      dtype: string
    - name: user
      dtype: string
    - name: answer_json
      dtype: string
---

# Unite4AI BFCL Multiple 50 (v1)

This task measures whether a model can choose the right tool and supply the right arguments in a single turn. It uses the first 50 items (`multiple_0` through `multiple_49`) from the Berkeley Function Calling Leaderboard (BFCL) v4 `multiple` category. Each item offers two or three tools and has one expected call.

This is **not an official BFCL score**. Unite4AI uses its own prompt format, a 50-item slice, and five passes. Results are not comparable with BFCL's published leaderboard. The prompts and labels are public, not a hidden test set, and may already be in model training data.

## Data and attribution

The `default` configuration contains one `test` split with 50 rows. It has four string columns:

| Column | Contents |
| --- | --- |
| `id` | Original BFCL item ID. |
| `system` | Exact system message sent by Unite4AI. |
| `user` | Exact user message, containing the request and tool schemas. |
| `answer_json` | JSON-encoded grading target: `name` is the expected tool and `params` maps each argument to its complete list of accepted values. |

The [BFCL questions](https://github.com/ShishirPatil/gorilla/blob/f7cf7359b7ac615a0b294831c5ba2bc95ee4a000/berkeley-function-call-leaderboard/bfcl_eval/data/BFCL_v4_multiple.json) and [accepted answers](https://github.com/ShishirPatil/gorilla/blob/f7cf7359b7ac615a0b294831c5ba2bc95ee4a000/berkeley-function-call-leaderboard/bfcl_eval/data/possible_answer/BFCL_v4_multiple.json) are by the Gorilla team at UC Berkeley and distributed under the [Apache License 2.0](LICENSE). Unite4AI selected the first 50 records in source order, wrapped each request and tool list in its `bfcl-multiple-1` two-message prompt, and rewrote schema types `dict`, `float`, and `tuple` as `object`, `number`, and `array`. Function names keep their dots. The accepted-value maps are serialized as JSON strings without dropping alternatives or changing their JSON types.

## Evaluation and checks

1. For each item, send `system` and `user` as separate messages in a fresh conversation. Keep `answer_json` out of the prompt; it is a grading target, not an executable call. The tools are prompt text only: do not register or execute them. The model is asked to return one JSON object with `tool` and `arguments`.
2. Run five complete passes in file order, one request at a time (250 replies). Use temperature `0.7`, top-p `1`, and at most `1024` new tokens per reply. Send `seed = run × 50 + item`, with both indices starting at zero. The method does not check whether the serving runtime honors the seed.
3. Score the last JSON object in the visible reply, after removing reasoning, with Unite4AI's port of BFCL's Python-mode `multiple` checker. A correct reply uses the exact expected tool, includes all required arguments and no unexpected ones, and matches accepted values under BFCL's type and normalization rules. Missing or null `arguments` are treated as empty; null argument values are treated as omitted. A non-required argument in the target may be omitted when its accepted values include `""`. The [published method](https://unite4ai.com/evals/bfcl-multiple-50/) details the scoring rules and checker calibration against BFCL.

Task `bfcl-multiple-50-v1-all-runs-pass-at-5` reports `100 × (items correct on all five passes) / 50`, a percentage from 0 to 100 (higher is better). It is neither “at least one of five” nor pass@1, which is the percentage correct across all 250 replies. Partial runs do not qualify.

[method.json](method.json) records the pinned sources and SHA-256 hashes, the packaged data hash, and the exact run settings. From the Unite4AI repository, `bun scripts/benchmarks/hf-bfcl.ts check <dataset-directory>` regenerates the expected package from the pinned inputs and checks it byte for byte without running a model. Scoring is external to Hugging Face; these checks do not confer a Hugging Face verified badge.
