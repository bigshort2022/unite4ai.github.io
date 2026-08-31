---
title: Choose open compute
summary: Compare self-hosted, community GPU, and federated training options — index the stack without locking into one vendor.
level: intermediate
persona: ["model-app-contributor", "dataset-code-contributor"]
track: open-stack
track_order: 3
duration_minutes: 30
prerequisites: ["Basic familiarity with Python or CLI tools"]
outcomes:
  - Read the compute catalog and identify protocol types
  - Choose between local, shared GPU, and federated training
  - Understand why Unite4AI indexes compute but does not broker it
author: unite4ai-team
updated: 2026-08-15
---

Compute is the layer most often gatekept. Open protocols let you train and infer without surrendering control.

## Decision guide

| Need | Open option |
|------|-------------|
| Laptop inference | Ollama, llama.cpp |
| GPU server | vLLM, self-hosted |
| Multi-site training without pooling data | Flower federated |
| Community GPUs | Open pools with documented APIs |

Browse the full catalog at [/stack/compute](/stack/compute).

## What we deliberately do not do

Unite4AI does not route your jobs or take a cut. We publish options; you choose where compute runs.
