---
benchmark: bfcl-multiple-50
benchmark_version: "1"
entries:
  - id: qwen3-6-35b-a3b
    model: qwen3-6-35b-a3b
    served_model: mlx-community/Qwen3.6-35B-A3B-4bit-DWQ
    submitter: bigshort2022
    runtime: mlx-lm
    format: mlx
    quantization: 4bit-DWQ
    hardware:
      device: Apple M5 Mac17,2
      accelerator: apple-silicon
      memory_gb: 32
    registered_on: "2026-11-23"
  - id: qwen3-4b-instruct-2507
    model: qwen3-4b-instruct-2507
    served_model: mlx-community/Qwen3-4B-Instruct-2507-4bit
    submitter: bigshort2022
    runtime: mlx-lm
    format: mlx
    quantization: 4bit
    hardware:
      device: Apple M5 Mac17,2
      accelerator: apple-silicon
      memory_gb: 32
    registered_on: "2026-11-23"
  - id: qwen3-8-27b
    model: qwen3-8-27b
    served_model: mlx-community/Qwen3.8-27B-4bit
    submitter: bigshort2022
    runtime: mlx-lm-go
    format: mlx
    quantization: 4bit
    hardware:
      device: Mac mini Mac16,11
      accelerator: apple-silicon
      memory_gb: 64
    registered_on: "2026-11-23"
---
