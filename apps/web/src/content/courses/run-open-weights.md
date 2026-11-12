---
title: Run open weights locally
summary: Load a model from the registry and run your first inference with Ollama or llama.cpp — no vendor API required.
level: beginner
persona: ["model-app-user", "ai-learner"]
track: open-stack
track_order: 2
duration_minutes: 35
prerequisites: ["A machine with 8GB+ RAM for small models"]
outcomes:
  - Install Ollama and pull an open model
  - Verify a weight artifact with sha256sum
  - Send a prompt through a local HTTP endpoint
author: unite4ai-team
updated: 2026-08-15
---

When you run weights locally, no one logs your prompts. This is the fastest escape hatch from AI you do not trust.

## Install Ollama

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama run llama3
```

## Verify before you trust

If the model card lists a sha256 checksum:

```bash
curl -L -o weights.gguf "ARTIFACT_URL"
sha256sum weights.gguf
```

Compare against the registry card. Mismatch means stop — do not run.

## Next

Browse [compute options](/stack/compute) for GPU servers when local hardware is not enough.
