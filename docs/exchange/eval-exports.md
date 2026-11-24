# Evaluation export handoff

Start at [the per-result export index](https://unite4ai.com/data/eval-exports.json). Each row identifies one public result file and links to its exact run on the benchmark page, its Every Eval Ever aggregate, and its evidence JSON. The export is not a leaderboard average, independent replication, a reviewed finding, or proof of an upstream import. Historical and measured results are included; they are not promoted to current scoring leaderboards.

`evidence.json` is the lossless projection of numeric measurements. It retains the score, sample count, run ID, assay version, harness, runtime and hardware, optional API and cost accounting, performance metrics, and the complete repeat-run object. It includes the published evidence hash and optional byte count, not the transcript. It omits execution commands, setup prose, and external transcript locations; the canonical result remains the source of truth.

## Every Eval Ever

The JSON targets [aggregate schema 0.3.0](https://github.com/evaleval/every_eval_ever/blob/09496fc02c6aa64ed696a95109be08bbd2164020/every_eval_ever/schemas/eval.schema.json). It projects published aggregate records, so `source_type` is `documentation`. The evaluator relationship is not inferred from the submitting GitHub account. A recorded HF weights artifact is used only if it matches the explicitly recorded served checkpoint; a local card ID is not a verified upstream model identity. No per-item artifact is generated.

The aggregate cites a benchmark source only when the result uses the current definition
and that source has a recorded digest. Otherwise the exact result page is the source.
Historical scores do not inherit today's metric definition; where upstream requires
`lower_is_better`, the aggregate labels its fallback value as unknown. Do not rank on it.

1. Select the exact result IDs and verify the model identity, benchmark version, metric, and units against the result pages. Don't submit a result to a sibling or base checkpoint or under an invented developer name. Check older versions against their actual historical definition.
2. Check the current [Every Eval Ever contribution instructions](https://evalevalai.com/every_eval_ever/contributing/) and [datastore](https://huggingface.co/datasets/evaleval/EEE_datastore). Use the required `data/<benchmark>/<developer>/<model>/<uuid-v4>.json` path for a review copy; the site's deterministic public filenames and IDs are not that layout. The export's required `retrieved_timestamp` is a documented UTC run-day surrogate because a static, reproducible build has no collection timestamp. For an upstream copy, record the actual retrieval timestamp and use the datastore's ID convention if required; keep the original Unite4AI result ID and source link.
3. Validate the staged documents using the upstream validator (`uv run python -m every_eval_ever validate data/` in its checkout). Submit a `[Submission]` PR manually, from the chosen account, after checking licensing/attribution. Surface unsupported fields and metrics in the PR; don't silently strip them.

## Hugging Face Community Evals

The index gives `hugging_face.status: ready` only if the reviewed task binding and recorded model artifact agree. `ready` means YAML can be staged for a human to review; it does not imply a successful upload, verification, or inclusion on a leaderboard. The current binding registry starts empty. In particular, a 200-item deterministic GSM8K run is not the [published HF GSM8K task](https://huggingface.co/datasets/openai/gsm8k/blob/main/eval.yaml), and the name “BFCL” does not prove that another dataset's task reproduces the pinned multiple-call slice and all-runs metric.

To add a binding, review the external dataset repository's exact `eval.yaml` at an immutable revision. Establish that the declared task uses the same items, subset, sampling, prompt, scoring and score unit as the site's benchmark version. Submit a binding in `apps/web/src/data/hf-eval-bindings.json` with `benchmark`, `version`, `dataset` (owner/repo), `task_id`, `revision` (40 lowercase hex), `source_sha256` (the site's published benchmark source hash), and `metric_unit`. This is a human method-equivalence assertion, not proof that two methods match because hashes or names happen to match. The build checks identity, version, hash, and unit against the site's current definition; it does not contact HF.

The index reports concrete blocked reasons for missing bindings, unsupported historical versions or hosted runs, unverified model artifacts, and source or metric mismatches. A blocked row has no uploadable YAML; use its evidence JSON for review. When an exact binding exists:

1. Confirm the dataset is a registered Benchmark, that the pinned task still accepts community results, and that the index's model repository is exactly the served weight artifact.
2. Stage the generated YAML at `.eval_results/<result-id>.yaml` in that model repository. Review the score and provenance; the YAML `source.url` points to the full evidence JSON. There is no `verifyToken`, HF user claim, or automatic posting.
3. Open a model repository PR manually using the [Community Evals instructions](https://huggingface.co/docs/hub/en/eval-results). Record the resulting link separately from the canonical result.

## Proposed upstream extensions (not submitted)

- **Every Eval Ever:** Standardize a typed, namespaced `unite4ai.repeat.v1` extension. Specify `item_count`, `runs`, `temperature`, `top_p`, `item_pass_histogram` (buckets from zero through `runs` correct), `run_correct` (run order), pass@1 and all-runs pass@k with 95% intervals, across-run SD in percentage points, and optional totals/per-attempt-success timing, prompt tokens, completion tokens, and energy. Preserve zero and absent fields distinctly. Today's aggregate carries the original repeat object as string-valued JSON in schema-approved metadata. `all-runs pass@k` is the proportion correct on **every** trial, not at-least-one pass@k. `seconds_per_success` is per successful attempt, not per item that succeeded in all runs.
- **Hugging Face:** Propose a versioned `extensions.unite4ai` object or a typed evidence URL/checksum field plus task-defined unit and repeat metric semantics. The scalar `value` alone cannot express the two pass rates, denominator, uncertainty, or resource basis. Until upstream accepts an extension, use only standard YAML fields and the existing `source.url` to the full evidence; do not add undocumented YAML keys.

Neither extension has been proposed to or approved by the upstream maintainers. The site uploads nothing and hosts no transcripts.
