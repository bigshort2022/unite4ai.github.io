---
name: mlx-lm-go
summary: Run Qwen text models on Apple silicon with an open-source Go server, an OpenAI-compatible API, and a bundled browser chat.
maintainers: ["unite4ai-team"]
protocol: inference-server
open_source_url: https://github.com/bigshort2022/mlx-lm-go
pricing_model: self-funded
coverage: Local on Apple silicon
last_verified: 2026-11-22
sdg_alignment: [9, 10]
updated: 2026-11-22
---

`mlx-lm-go` is an MIT-licensed inference server built on Apple's MLX C library. It runs Qwen2.5 and supported dense Qwen3.5 and Qwen3.8 text checkpoints on your Mac without a Python runtime. It supports streaming, Qwen3.x function calling, and opt-in prompt-prefix caching. Model weights are downloaded separately and have their own licenses.

## Getting started

The [v0.1.0 release](https://github.com/bigshort2022/mlx-lm-go/releases/tag/v0.1.0) includes a binary for Apple silicon on macOS 26 or later and `SHA256SUMS`. Verify the archive and follow the release instructions to unpack it. Install Homebrew's `mlx-c` and the Hugging Face CLI before running these commands from the unpacked directory:

```sh
brew install mlx-c
hf download mlx-community/Qwen2.5-1.5B-Instruct-4bit
./mlx-lm-go server --model mlx-community/Qwen2.5-1.5B-Instruct-4bit
```

Open [the local chat](http://127.0.0.1:8080/) or point a compatible client at `http://127.0.0.1:8080/v1`. See the [OMP setup instructions](https://github.com/bigshort2022/mlx-lm-go/blob/v0.1.0/README.md#use-with-omp) for a local coding agent. The server does not authenticate clients: keep it on loopback unless you set up access controls. Unite4AI indexes the project; it does not host the server or proxy prompts.
