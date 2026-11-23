---
title: Run open weights locally
summary: Verify a pinned Qwen GGUF download and send a fictional rehearsal prompt to llama.cpp on your own machine.
level: beginner
persona: ["model-app-user", "ai-learner"]
track: open-stack
track_order: 2
duration_minutes: 35
prerequisites: ["For the hands-on path: macOS (Apple silicon) or Linux (x86-64), 8 GB RAM recommended, and at least 1 GB free disk space for the model"]
outcomes:
  - Identify and download one pinned Qwen GGUF artifact
  - Check the weight file against the publisher's SHA-256
  - Send a prompt through a local HTTP endpoint
author: unite4ai-team
updated: 2026-11-23
---

Start with the [fictional rehearsal-planning exercise](/school/sovereign-ai/#data-privacy).
The paper version and answer check need no installation, download, or account. If you
want to try the same task with a model, follow the steps below.

## 1. Prepare your machine

This example uses **Qwen2.5-0.5B-Instruct, Q4_K_M GGUF**, published by Qwen under
[Apache-2.0](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/blob/9217f5db79a29953eb74d5343926648285ec7e67/LICENSE).
Use a Mac with Apple silicon or an x86-64 Linux machine. Allow 8 GB RAM as a starting
recommendation, not a measured minimum, and at least 1 GB free for the 491,400,032-byte
model download, plus space for the runner. No dedicated GPU or cloud account is required.

Follow the [official llama.cpp installation instructions](https://github.com/ggml-org/llama.cpp/blob/master/docs/install.md).
For example, with Homebrew already installed, use `brew install llama.cpp`. In a
terminal, run `llama-server --version` and record the version if you want to reproduce
your result later. The commands also need `curl` and `shasum` (macOS) or `sha256sum` (Linux).

## 2. Download and verify the pinned file

The [published Git LFS pointer](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/raw/9217f5db79a29953eb74d5343926648285ec7e67/qwen2.5-0.5b-instruct-q4_k_m.gguf)
and the [Hub file metadata](https://huggingface.co/api/models/Qwen/Qwen2.5-0.5B-Instruct-GGUF/tree/9217f5db79a29953eb74d5343926648285ec7e67)
agree on the size and SHA-256 of this file at revision `9217f5db79a29953eb74d5343926648285ec7e67`.
The downloaded file matched this SHA-256 in a test on an Apple silicon Mac with
llama.cpp build `8994` (`aab68217b`). The loopback request below returned HTTP 200
on that setup. The Linux setup was not tested.

In a terminal, from a folder where you can save the model, run:

```bash
curl -fL -o qwen2.5-0.5b-instruct-q4_k_m.gguf \
  https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/9217f5db79a29953eb74d5343926648285ec7e67/qwen2.5-0.5b-instruct-q4_k_m.gguf &&
printf '%s  %s\n' \
  74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db \
  qwen2.5-0.5b-instruct-q4_k_m.gguf |
  if [ "$(uname -s)" = Darwin ]; then shasum -a 256 -c; else sha256sum -c; fi
```

Continue only if the check prints `qwen2.5-0.5b-instruct-q4_k_m.gguf: OK`.
On a failed download or mismatch, stop; check the pinned revision and filename
before retrying. A match checks the downloaded bytes against the publisher's SHA-256.
It does not establish that the model is safe, accurate, or fully open, or verify the
runner you installed.

## 3. Send one request over loopback

With the verified file in the current directory, start the
[llama.cpp server](https://github.com/ggml-org/llama.cpp/tree/master/tools/server).
Keep this terminal open. The server listens only on this machine; don't change the
address to `0.0.0.0` or forward the port.

```bash
llama-server --model ./qwen2.5-0.5b-instruct-q4_k_m.gguf \
  --alias qwen-rehearsal --ctx-size 2048 --host 127.0.0.1 --port 8080 --no-webui
```

Once the server reports that the model is ready, open a second terminal:

```bash
curl --noproxy '*' --fail --silent --show-error \
  -H 'Content-Type: application/json' \
  --data '{
    "model": "qwen-rehearsal",
    "messages": [{
      "role": "user",
      "content": "Turn the following notes into three short lines. Use the labels When and where, Amp, and Still to do. Notes: rehearsal Tuesday at 6:30 p.m. in Room B; Nina brings the amp; the venue has not confirmed."
    }],
    "stream": false,
    "temperature": 0,
    "max_tokens": 96,
    "repeat_penalty": 1.17
  }' \
  http://127.0.0.1:8080/v1/chat/completions
```

Expect HTTP 200 and a JSON reply with text in `choices[0].message.content`. In the
Mac test the reply preserved the schedule, Nina's task, and the unconfirmed venue,
but returned prose rather than three lines. Compare the reply with the paper
checklist: keep Tuesday at 6:30 p.m. in Room B, Nina bringing the amp, and venue
confirmation still open. Correct omissions or invented facts before using the
answer. HTTP 200 only shows that the server answered. If the connection is refused,
check the first terminal for startup errors or an occupied port; if you change the
port, use the same value in both commands. Stop the server with `Ctrl-C` when done.

## What stays local?

The install and model download contact outside servers. The example prompt is sent
directly to the loopback address, bypassing proxies, and the runner uses a file already
on disk. With setup complete, you can disconnect from the network before trying the
request. That is not a no-logging guarantee: shell history can retain the command,
terminal output can contain the reply, and other local software or backups may retain
copies. Other processes on your machine can reach the loopback service while it runs.
Use fictional notes, and check logs, history, sync, and backup settings before using
real material.

## Next

For a different artifact, start at its [registry model card](/registry/).
Check its exact format, license, hardware needs, and any published checksum rather
than swapping its name into this command. Browse the [compute catalog](/stack/compute/)
for other runtimes.
