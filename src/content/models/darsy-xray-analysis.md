---
name: Darsy X-Ray Analysis
summary: Multimodal generative AI for radiological analysis — detection, anatomical segmentation, and GAN-based image enhancement, trained with federated learning.
maintainers: ["unite4ai-team"]
license: apache-2.0
openness:
  weights: open
  training_data: documented
  training_code: open
  evaluation: open
artifacts:
  - kind: paper
    url: https://www.jacr.org/article/S1546-1440(22)00404-4/fulltext
  - kind: demo
    url: https://github.com/unite4ai/unite4ai.github.io
tasks: ["image-segmentation", "image-classification", "anomaly-detection"]
domains: ["healthcare", "medical-imaging"]
sdg_alignment: [3]
community_led: false
featured: true
updated: 2026-08-01
---

Darsy is Unite4AI's flagship healthcare model, built on federated-learning research that lets
hospitals collaborate on model training **without ever pooling patient data**.

## What it does

- **Progressive Growing GAN preprocessing** — enhances degraded, over/under-exposed, or artifact-heavy X-ray, CT, and MRI images before analysis.
- **Diagnostic detection** — flags abnormalities across conditions including cancers, cardiovascular disease, and diabetic retinopathy, with calibrated confidence scores.
- **Anatomical segmentation** — distinguishes tissue, bone, organs, and lesions, localizing the extent of detected findings.
- **Continuous monitoring** — combines detection and segmentation for longitudinal tracking and disease-progression forecasting.

## Why federated

Medical privacy regulations rightly prevent centralizing patient data, and no single hospital has
enough data to train a strong model alone. Federated learning resolves the deadlock: the model
travels to the data, gradients travel back, raw records never leave the institution. Differential
privacy is applied on top of the aggregation step.

## Intended use and limits

> **Not a medical device.** This model is a research and decision-support tool. It is not cleared
> by any regulator for autonomous diagnosis. Every output requires review by a qualified clinician.

Known limitations: performance varies across scanner manufacturers and imaging protocols;
evaluation cohorts under-represent several populations — see the evaluation report before
deploying in any new setting.
