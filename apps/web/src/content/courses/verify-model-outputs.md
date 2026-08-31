---
title: Verify model outputs
summary: Check weight checksums, replay evaluation bundles, and know when you can trust a model card — without taking anyone's word for it.
level: intermediate
persona: ["model-app-contributor", "model-app-user"]
track: open-stack
track_order: 4
duration_minutes: 40
prerequisites: ["Completed Run open weights locally or equivalent"]
outcomes:
  - Verify a weight artifact with sha256sum
  - Interpret eval bundle checksums and reproducibility badges
  - Know when CI has confirmed an eval replay
author: unite4ai-team
updated: 2026-08-15
---

Verifiable compute means you can check outputs independently — not that someone certified the model as safe.

## Three verification layers

1. **Weights** — sha256 of downloaded artifacts matches the registry card
2. **Eval** — eval bundle checksum matches; optional CI replay badge
3. **Inference** — you control the runtime; compare outputs across versions

## Practice

Open any model in [/registry](/registry) and use the **Verify** panel:

- Weights tab → run the printed `sha256sum` command
- Eval tab → download bundle and compare hash
- Inference tab → follow the run-local guide

## Honest limits

Checksums prove file integrity, not fairness or safety. Reproducible evals prove benchmark claims were run — not that the benchmark is sufficient.
