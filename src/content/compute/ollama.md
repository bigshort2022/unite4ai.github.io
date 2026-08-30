---
name: Ollama
summary: Run open models locally with a simple CLI and HTTP API — no account, no cloud dependency.
maintainers: ["unite4ai-team"]
protocol: inference-server
open_source_url: https://github.com/ollama/ollama
pricing_model: self-funded
coverage: Local and LAN
last_verified: 2026-08-01
sdg_alignment: [9, 10]
updated: 2026-08-01
---

Ollama wraps llama.cpp and other runtimes into a one-command local inference server.
It is the fastest path from an open model card to a working chat on your own hardware.

## Why it belongs in the open stack

- **No gatekeeper** — models run on your machine
- **Open source** — inspect and fork the runtime
- **Protocol-first** — HTTP API compatible with many client libraries

## Getting started

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama run llama3
```

Pair with any model in the [Unite4AI registry](/registry) that lists an Ollama-compatible weight artifact.
