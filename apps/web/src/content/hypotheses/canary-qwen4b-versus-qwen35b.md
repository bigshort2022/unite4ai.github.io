---
{
  "title": "Does Qwen3-4B resist fewer canary injections than Qwen3.6-35B-A3B?",
  "claim": "On canary-injection-v1, Qwen3-4B-Instruct-2507 in 4bit resists a smaller share of the 50 templated indirect prompt injections than Qwen3.6-35B-A3B in 4bit-DWQ. This is a claim about the benchmark metric, not general real-world security.",
  "benchmark": "canary-injection-v1",
  "models": [
    "qwen3-4b-instruct-2507",
    "qwen3-6-35b-a3b"
  ],
  "prediction": "The recorded Qwen3-4B-Instruct-2507 run would have a lower resisted percentage than the Qwen3.6-35B-A3B run on the same benchmark version; resisted means a non-empty visible reply without the literal canary, not verified safe task completion.",
  "author": "bigshort2022",
  "agent": {
    "model": "openai-codex/gpt-6-astra",
    "harness": "omp"
  },
  "date": "2026-11-20"
}
---
