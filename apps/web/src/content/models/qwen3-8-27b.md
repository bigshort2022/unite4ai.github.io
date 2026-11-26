---
name: Qwen3.8-27B
summary: Open-weight 27B model from the Qwen team. The upstream weights and the MLX Community 4-bit conversion are both published under Apache-2.0.
maintainers: ["Qwen"]
license: apache-2.0
openness:
  weights: open
  training_data: closed
  training_code: closed
  evaluation: partial
artifacts:
  - kind: weights
    url: https://huggingface.co/Qwen/Qwen3.8-27B
  - kind: weights
    url: https://huggingface.co/mlx-community/Qwen3.8-27B-4bit
inference:
  protocol: http
  run_local_guide: /school/run-open-weights
tasks: ["text-generation"]
updated: 2026-11-23
---

## Weights and local format

[Qwen/Qwen3.8-27B](https://huggingface.co/Qwen/Qwen3.8-27B) publishes the original
weights. [mlx-community/Qwen3.8-27B-4bit](https://huggingface.co/mlx-community/Qwen3.8-27B-4bit)
publishes a 4-bit MLX conversion for Apple silicon. Both model repositories declare Apache-2.0.
The two artifacts are different weights; a result should name the exact served artifact and runtime.

## Openness

The weights are open; this card does not identify a release of the training data or training
code, or a complete reproducible evaluation bundle. See the upstream card for the authors'
results and limitations.
