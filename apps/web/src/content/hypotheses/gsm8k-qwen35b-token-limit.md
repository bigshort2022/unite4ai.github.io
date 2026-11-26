---
{
  "title": "Did the 512-token limit lower Qwen3.6-35B-A3B GSM8K accuracy?",
  "claim": "The 512-token reply limit in GSM8K-200 version 1 lowered Qwen3.6-35B-A3B accuracy by cutting off replies before their final answers.",
  "benchmark": "gsm8k-200",
  "models": [
    "qwen3-6-35b-a3b"
  ],
  "prediction": "Holding items, model setup and scoring fixed, a larger reply budget would reduce cut-off replies and increase accuracy. The existing version 1 and version 2 runs cannot isolate this effect because both budget and scoring changed.",
  "author": "bigshort2022",
  "agent": {
    "model": "openai-codex/gpt-6-astra",
    "harness": "omp"
  },
  "date": "2026-11-20"
}
---
