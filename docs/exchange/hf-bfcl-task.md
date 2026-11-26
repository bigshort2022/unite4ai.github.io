# Register the Unite4AI BFCL task on Hugging Face

This package defines one externally scored [Community Evals](https://huggingface.co/docs/hub/en/eval-results) task: `bfcl-multiple-50-v1-all-runs-pass-at-5`, config `default`, split `test`. The metric is the percentage of items correct on **every** one of five passes (higher is better). This is the [Unite4AI 50-item method](https://unite4ai.com/evals/bfcl-multiple-50), not an official BFCL score. The prompts and accepted answers are public; the task is neither a hidden test nor an Inspect evaluation.

## 1. Build and check locally

From the Unite4AI checkout root, with Bun and the workspace dependencies already installed:

```sh
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/unite4ai-bfcl.XXXXXXXX")"
PACKAGE="$WORK_DIR/package"
bun scripts/benchmarks/hf-bfcl.ts build "$PACKAGE"
bun scripts/benchmarks/hf-bfcl.ts check "$PACKAGE"
```

`build` requires a new directory. It uses the checked-in BFCL inputs and emits only `README.md`, `eval.yaml`, `LICENSE`, `method.json`, and `data/test.jsonl`. The generator checks the pinned question and answer hashes; `check` regenerates the expected package in memory and compares its bytes on disk. Both print a JSON receipt. Neither command needs Hugging Face credentials, contacts a model, or runs any tool calls in the dataset. Do not add result records, logs, or transcripts to the upload.

## 2. Have the owner upload and obtain the Benchmark tag

The owner chooses the public dataset namespace and repository name and authorizes the upload. Log in as the owner or an authorized writer for that namespace:

```sh
hf auth login
hf auth whoami
```

Confirm that `whoami` shows the intended account before changing the Hub. Replace `YOUR-NAMESPACE` and the proposed name if needed, and keep these shell variables for the next step.

```sh
DATASET='YOUR-NAMESPACE/unite4ai-bfcl-multiple-50'
hf repos create "$DATASET" --type dataset --public
hf upload "$DATASET" "$PACKAGE" . --type dataset \
  --commit-message 'Add Unite4AI BFCL multiple v1 benchmark task'
```

Open `https://huggingface.co/datasets/<owner>/<repo>` and confirm the Hub accepted `eval.yaml`. Follow Hugging Face's [benchmark registration instructions](https://huggingface.co/docs/hub/en/eval-results#registering-a-benchmark) to request allow-list approval. Upload and local validation are not registration: confirm that the Hub actually displays its **Benchmark** tag on the public dataset and that the exact task accepts community results. If Hugging Face rejects the task or requires a new framework identifier, leave the site entry blocked until the real task is approved. Do not claim a different framework or bind a similarly named upstream task.

## 3. Download and verify the exact Hub revision

From the dataset's **Files and versions** history, copy the full 40-character lowercase hexadecimal commit SHA for the approved package. Do not use `main`, a tag name, a short SHA, or the upstream BFCL source commit. Substitute the copied SHA below. Download the actual five files into a fresh directory, not the directory used for the upload:

```sh
REVISION='<full-lowercase-hub-commit-sha>'
DOWNLOAD="$(mktemp -d "${TMPDIR:-/tmp}/unite4ai-bfcl-download.XXXXXXXX")"
printf '%s\n' "$REVISION" | grep -Eq '^[0-9a-f]{40}$' &&
  hf download "$DATASET" README.md eval.yaml LICENSE method.json data/test.jsonl \
    --type dataset --revision "$REVISION" --local-dir "$DOWNLOAD" &&
  bun scripts/benchmarks/hf-bfcl.ts check "$DOWNLOAD"
```

Stop if any file is missing, changed, or rejected by the checker. Record the dataset ID, the checked commit SHA, and the successful check receipt for the binding review. If the dataset or task changes before submission, reconfirm registration and recheck the intended revision.

## 4. Bind the checked task, then review the generated result

Only after steps 2 and 3 pass, add a real entry to `apps/web/src/data/hf-eval-bindings.json`. Replace the two bracketed values with the actual Hub dataset ID and checked revision. `source_sha256` is the benchmark's pinned BFCL **question-file** digest, not the Hub commit SHA or the generated JSONL digest.

```json
{
  "benchmark": "bfcl-multiple-50",
  "version": "1",
  "dataset": "<owner>/<repo>",
  "task_id": "bfcl-multiple-50-v1-all-runs-pass-at-5",
  "revision": "<full-lowercase-hub-commit-sha>",
  "source_sha256": "aef168155ebd74b7ac2401198b201343bc7d16d7a3d7e0d4e6d8ee82c6969b2a",
  "metric_unit": "%"
}
```

Rebuild the site locally and inspect the export index entry, YAML, and evidence for the existing published run:

```sh
bun run build
RESULT_ID='qwen3-8-27b--bfcl-multiple-50--bigshort2022--2026-11-23--5e58a1a8'
EXPORT_DIR="apps/web/dist/data/eval-exports/$RESULT_ID"
RESULT_ID="$RESULT_ID" bun -e 'const index = await Bun.file("apps/web/dist/data/eval-exports.json").json(); console.log(index.results.find((row) => row.id === process.env.RESULT_ID));'
cat "$EXPORT_DIR/huggingface.yaml" "$EXPORT_DIR/evidence.json"
```

- The index should say `hugging_face.status: ready` and name exactly `mlx-community/Qwen3.8-27B-4bit`, not the base Qwen repo or another conversion. `ready` means the YAML can be staged for review; it is not confirmation of Hub acceptance.
- The YAML must reference the checked dataset ID, revision and exact task ID, and report numeric `value: 76` in percent (38 of 50 items correct on all five passes), **not** the 88.8% pass@1 statistic.
- `source.url` must be the run's [published evidence JSON](https://unite4ai.com/data/eval-exports/qwen3-8-27b--bfcl-multiple-50--bigshort2022--2026-11-23--5e58a1a8/evidence.json), not the dataset or a transcript URL. The YAML must omit `verifyToken` and `source.user`.

## 5. Obtain separate approval before opening the model PR

Creating the dataset and adding the binding do not authorize a model-repository submission. Show the owner the exact destination, review copy, and source URL. After they separately approve submitting this community result, stage `huggingface.yaml` as `.eval_results/<result-id>.yaml` in a PR to the exact served repository. For example, from the authorized HF account:

```sh
hf upload mlx-community/Qwen3.8-27B-4bit "$EXPORT_DIR/huggingface.yaml" \
  ".eval_results/$RESULT_ID.yaml" --type model --create-pr \
  --commit-message 'Add Unite4AI BFCL multiple v1 community result'
```

Record the PR URL separately from the canonical Unite4AI result. Do not push directly, merge on behalf of the model maintainer, claim that Hugging Face verified the run, or create a verification token. See the [general export handoff](eval-exports.md) for the provenance rules.
