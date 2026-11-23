---
title: Open AI Foundations
summary: What "open" actually means in AI, how to read a model card critically, and how to spot open-washing before it costs you.
level: beginner
persona: ["ai-learner", "model-app-user"]
duration_minutes: 45
prerequisites: []
outcomes:
  - "Explain the four axes of the Model Openness Framework"
  - "Read a model card and identify what the publisher is not telling you"
  - "Distinguish genuinely open models from open-washed ones"
  - "Explain what a local model run does and does not keep private"
author: unite4ai-team
updated: 2026-08-01
---

Most people meet AI through a text box owned by a company that will not tell them what's behind
it. This course is about the alternative — and about the difference between the alternative and
things that merely look like it.

## 1. "Open source AI" is a contested phrase

When a company calls a model open source, verify what they actually released. The Model Openness
Framework separates four axes that marketing routinely collapses into one word:

| Axis | The real question |
|---|---|
| **Weights** | Can you download the parameters and run them yourself? |
| **Training data** | Do you know what it learned from, in enough detail to audit? |
| **Training code** | Could you reproduce the training run given the resources? |
| **Evaluation** | Are benchmarks and failure modes published honestly? |

A model can score fully open on weights and completely closed on the other three. That is the
most common shape in the industry today — and it's usually announced as "open source AI."

## 2. Why the license matters more than the download button

Several widely publicized "open" models ship licenses that cap commercial usage by company size,
forbid using outputs to improve competing models, or reserve the right to revoke your grant. Those
are not open source licenses. They are source-available licenses with a marketing department.

**Practical test:** find the license file. If it is not a recognizable OSI-approved license
(Apache-2.0, MIT, BSD) or an open Creative Commons license, read every clause before you build on it.

> On Unite4AI, this test is automated. Our submission pipeline rejects licenses outside a public
> allowlist, so nothing in our registry can quietly carry usage restrictions.

## 3. Reading a model card critically

Ask these four questions of any card:

1. **What data?** "A large corpus of internet text" tells you nothing. Look for sources, dates, languages, and filtering method.
2. **Evaluated on whom?** A model at 95% accuracy overall can be at 60% for a subgroup that isn't in the headline number.
3. **What are the stated limits?** A card with no limitations section is a marketing page, not a model card.
4. **Who is accountable?** A named maintainer and a working issue tracker beat an anonymous upload.

## 4. Run one yourself

To see what local inference looks like, follow [Run open weights locally](/school/run-open-weights/).
It uses one pinned Qwen GGUF file and shows how to check its SHA-256 before sending
a fictional prompt to the runner on your own machine. Local processing doesn't mean
the prompt and reply leave no traces: check history, logs, sync, and backups.

Prefer not to install anything? Try the [paper rehearsal-planning exercise](/school/sovereign-ai/#data-privacy)
and use its answer check to compare paper, local inference, and hosted chat.

## 5. What to do next

- [Browse the model registry](/registry/), open a card, and choose an openness axis marked partial or closed. Compare the card with the publisher's evidence and note what's missing.
- Take [Publishing Your First Open Model Card](/school/first-model-card/) and draft an entry yourself.
- Bring one question to community office hours. Beginner questions make the best sessions.
