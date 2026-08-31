---
title: Publishing Your First Open Model Card
summary: Take a model you've built or found and publish a complete, honest, verifiable card to the Unite4AI registry — no git experience required.
level: beginner
persona: ["model-app-contributor", "dataset-code-contributor"]
duration_minutes: 60
prerequisites: ["Open AI Foundations"]
outcomes:
  - "Write a model card that survives peer review"
  - "Compute and publish artifact checksums so others can verify your files"
  - "Submit a contribution through a web form, browser editor, or pull request"
  - "Respond productively to review feedback"
author: unite4ai-team
updated: 2026-08-01
---

Your first contribution to an open platform is mostly a courage problem, not a technical one.
This course removes both obstacles.

## 1. Pick something to document

Good first entries: a model you fine-tuned, a model you use often whose card is thin, or a model
in a language or domain our registry ignores. That last category is the most valuable — coverage
gaps are where an open registry earns its existence.

## 2. Gather the facts before you write

You need, at minimum: the exact license (find the file, don't trust the README badge), where the
weights live, what the training data was, how it was evaluated, and where it fails. If you cannot
answer the last one, you do not yet know the model well enough to publish about it.

## 3. Make it verifiable

Anyone downloading a model should be able to prove they got what you described:

```bash
# Compute the checksum of your artifact
sha256sum model.safetensors

# Anyone else can verify their download matches
echo "<your-sha256>  model.safetensors" | sha256sum --check
```

Put that hash in the `sha256` field of your card. This single step is what separates a registry
from a link dump.

## 4. Choose your submission path

**No git?** Open the model submission form. Fill in the fields, hit submit, and a maintainer
converts it into a pull request for you.

**Comfortable in a browser?** Use the "Suggest an edit" link on any registry page — GitHub forks
the repo and opens a PR automatically.

**Command line?**

```bash
git clone https://github.com/<you>/unite4ai.git
cd unite4ai && npm install
git checkout -b add-my-model
# create src/content/models/my-model.md using an existing card as a template
npm run build     # fails loudly if your card is invalid — that's the point
git commit -am "Add my-model card" && git push origin add-my-model
```

Then open the pull request from GitHub's UI.

## 5. Expect review, and don't take it personally

Reviewers will ask about the training data, push back on vague limitation sections, and check your
license claim. This is the process working. The point of a curated open registry is that entries
get read carefully before they get published — that scrutiny is exactly what makes an entry here
worth more than a link on a personal site.

## 6. After it merges

You're a Contributor. Your name goes on the contributors page, you can vote in community polls,
and after five merged PRs you're eligible for maintainer nomination. Welcome — go find the next gap.
