---
name: vLLM
summary: High-throughput open inference server for LLMs — OpenAI-compatible API, self-hosted.
maintainers: ["unite4ai-team"]
protocol: inference-server
open_source_url: https://github.com/vllm-project/vllm
pricing_model: self-funded
coverage: Self-hosted GPU clusters
last_verified: 2026-08-01
sdg_alignment: [9]
updated: 2026-08-01
---

vLLM serves open weights withPagedAttention for efficient GPU utilization.
Use it when you need production-grade throughput without a proprietary API.

## Open stack fit

- **Weights in, HTTP out** — you control both ends
- **Reproducible deployments** — Docker + pinned model checksums
- **Community pools** — many shared GPU projects expose vLLM endpoints

See the [Run open weights](/school/run-open-weights) course for a minimal setup.
