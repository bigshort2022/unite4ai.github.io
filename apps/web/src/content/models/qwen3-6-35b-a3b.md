---
name: Qwen3.6-35B-A3B
summary: Open-weight multimodal language model from the Qwen team with 35B parameters in total and about 3B active per token (mixture of experts). Apache-2.0 weights; training data and training code are not published.
maintainers: ["Qwen"]
license: apache-2.0
openness:
  weights: open
  training_data: closed
  training_code: closed
  evaluation: partial
artifacts:
  - kind: weights
    url: https://huggingface.co/Qwen/Qwen3.6-35B-A3B
  - kind: weights
    url: https://huggingface.co/mlx-community/Qwen3.6-35B-A3B-4bit-DWQ
inference:
  protocol: vllm
  run_local_guide: /school/run-open-weights
tasks: ["text-generation", "image-text-to-text"]
domains: []
sdg_alignment: []
community_led: false
featured: false
updated: 2026-11-14
---

## Overview

Qwen3.6-35B-A3B is described by its authors as a causal language model with a vision encoder:
35B parameters in total with 3B activated, and a native context length of 262,144 tokens.
The weights are published at [Qwen/Qwen3.6-35B-A3B](https://huggingface.co/Qwen/Qwen3.6-35B-A3B)
under Apache-2.0 (the repository carries the licence file).

Everything in this card was read from that upstream model page on 2026-11-14. Unite4AI did
not train this model and has no relationship with its authors.

## Openness

- **Weights: open.** Downloadable under Apache-2.0.
- **Training data: closed.** The upstream model card does not describe the training data.
- **Training code: closed.** No training code is published with the weights.
- **Evaluation: partial.** The authors publish benchmark tables with notes on how some
  numbers were produced, including an internal benchmark, but no reproducible evaluation
  bundle. The results on this site are independent runs with their commands and evidence.

## Local formats

The MLX conversion evaluated here is
[mlx-community/Qwen3.6-35B-A3B-4bit-DWQ](https://huggingface.co/mlx-community/Qwen3.6-35B-A3B-4bit-DWQ).
That repository declares neither a licence nor a base model; its link to the upstream
weights is inferred from its name and architecture. Its quantization is mixed precision,
labelled `4bit-DWQ` by the converter.

## How it was evaluated here

The results on this site were produced with the model's thinking mode switched off
(`enable_thinking: false` in the server's chat template arguments). With thinking on, the
model spends part of each reply's token limit on reasoning, so scores are not comparable
across the two modes. Each result states its mode in the setup notes.

## Limitations

Read the upstream model card before use. Nothing here is a safety or fitness assessment.
