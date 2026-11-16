---
name: Qwen3-4B-Instruct-2507
summary: Open-weight 4B-parameter text model from the Qwen team, an update of Qwen3-4B that runs in non-thinking mode only. Apache-2.0 weights; training data and training code are not published.
maintainers: ["Qwen"]
license: apache-2.0
openness:
  weights: open
  training_data: closed
  training_code: closed
  evaluation: partial
artifacts:
  - kind: weights
    url: https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507
  - kind: weights
    url: https://huggingface.co/mlx-community/Qwen3-4B-Instruct-2507-4bit
inference:
  protocol: vllm
  run_local_guide: /school/run-open-weights
tasks: ["text-generation"]
domains: []
sdg_alignment: []
community_led: false
featured: false
updated: 2026-11-15
---

## Overview

Qwen3-4B-Instruct-2507 is described by its authors as a causal language model with 4.0B
parameters (3.6B excluding embeddings), 36 layers and a native context length of 262,144
tokens. They state that it supports only non-thinking mode and does not produce `<think>`
blocks. The weights are published at
[Qwen/Qwen3-4B-Instruct-2507](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507) under
Apache-2.0 (the repository carries the licence file).

Everything in this card was read from that upstream model page on 2026-11-15. Unite4AI did
not train this model and has no relationship with its authors.

## Openness

- **Weights: open.** Downloadable under Apache-2.0.
- **Training data: closed.** The upstream model card does not describe the training data.
- **Training code: closed.** No training code is published with the weights.
- **Evaluation: partial.** The authors publish a benchmark table comparing the model with
  others, but no reproducible evaluation bundle. The results on this site are independent
  runs with their commands and evidence.

## Local formats

The MLX conversion evaluated here is
[mlx-community/Qwen3-4B-Instruct-2507-4bit](https://huggingface.co/mlx-community/Qwen3-4B-Instruct-2507-4bit).
That repository declares Apache-2.0 and names the upstream weights as its base model. It
says it was converted with mlx-lm 0.26.2; its quantization is labelled `4bit`.

## How it was evaluated here

The model has no thinking mode, so there is no mode to state. The server it ran on was
started with thinking disabled in its chat template arguments, which this model ignores.

The runs dated 2026-11-15 were made on a laptop running on battery with macOS Low Power
Mode on, which lowers speed: read their tokens per second as a floor for that hardware. The
scores do not depend on speed.

## Limitations

Read the upstream model card before use. Nothing here is a safety or fitness assessment.
