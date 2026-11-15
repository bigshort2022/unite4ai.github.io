---
name: Decode speed on GSM8K-200
summary: Tokens generated per second, after the first token, while a model answers the GSM8K-200 items one at a time. Ranked per machine, because speed only compares on the same hardware.
category: efficiency
version: "1"
metric:
  name: decode speed
  unit: " tok/s"
  higher_is_better: true
  min: 0
scoring: measured
items: 0
measured_on: gsm8k-200
source_url: https://github.com/bigshort2022/unite4ai.github.io/blob/main/apps/cli/src/eval/run.ts
license: apache-2.0
updated: 2026-11-14
---

## What it measures

How fast a local setup generates text: the model, its format and quantization, the runtime,
and the machine. It says nothing about answer quality; read it next to
[GSM8K (first 200)](/evals/gsm8k-200), which comes from the same run.

## Method

1. The runner answers the 200 GSM8K-200 items one request at a time, streaming, at
   temperature 0 with at most 512 new tokens.
2. For each request it records when the first generated token arrives and when the reply
   ends, and takes the number of generated tokens from the server's own usage count.
3. The score is the total number of generated tokens divided by the total time spent
   generating after the first token, across all 200 requests.
4. A run whose server reports no token count has no speed result. Nothing is estimated.

The result carries the same transcript hash as the quality result of that run.

## Known weaknesses

- **It depends on what else the machine was doing.** Other processes, memory pressure and
  thermal throttling all move the number. Treat a single run as indicative.
- **The token count is the server's.** Runtimes count tokens slightly differently, and the
  count includes end-of-sequence and any reasoning tokens.
- **One workload.** Short prompts and replies of a few hundred tokens; long-context
  throughput can differ.
- **No energy figure.** Power draw is not measured.

## Licence

The method is the runner's source code, Apache-2.0.
