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
  - "Run an open model locally with no cloud account"
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

The fastest way to internalize that open models are real is to run one on your own machine.

```bash
# Install a local runner (macOS/Linux)
curl -fsSL https://ollama.com/install.sh | sh

# Pull and chat with an openly licensed model
ollama run gemma3
```

No account, no API key, no network call after the download. Whatever you type stays on your
hardware. That is what people mean when they say sovereignty over AI.

## 5. What to do next

- Browse our registry and find a model scoring below 50% openness — read its card and identify which axis it fails.
- Take the next course, *Publishing Your First Open Model Card*, and add an entry yourself.
- Bring one question to community office hours. Beginner questions make the best sessions.
