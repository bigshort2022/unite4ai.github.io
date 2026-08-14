# Contributing to Unite4AI

Contribution is membership here. Your first merged pull request makes you a Contributor —
there is no separate signup.

## Three ways in

**1. A web form (no git).** Open an [issue form](../../issues/new/choose), fill in the fields,
submit. A maintainer converts it into a pull request. Most contributions arrive this way.

**2. Browser editing.** Every page has a "Suggest an edit" link. GitHub forks the repo and opens
a pull request when you save.

**3. Clone and PR.**

```bash
git clone https://github.com/<you>/unite4ai.git
cd unite4ai && npm install
git checkout -b my-contribution

# add or edit a file under src/content/
npm run validate && npm run build

git commit -am "Add <thing>" && git push origin my-contribution
```

## What gets checked

Every pull request runs the same gate:

1. **Schemas** — required fields present and well-formed
2. **License allowlist** — restrictive "open" licenses are rejected with an explanation
3. **Checksums** — `sha256` values must be valid 64-character hex digests
4. **Build** — the site must build cleanly with your change

A red check is information, not judgment. The message names the file and the field.

## Content standards

- **Honesty over polish.** "Training data unknown" is a respected answer. A vague claim of openness is not.
- **Every model card needs a limitations section.** Cards without one read as marketing.
- **Every dataset card needs consent basis, PII review status, and named bias gaps.** The schema enforces this.
- **Cite sources.** Link the paper, the license file, the repository.

## Review

Target: a first response within 48 hours. We publish the real median, including when it's bad.

Reviewers will ask questions — about training data, about license claims, about who is missing
from the evaluation set. That scrutiny is the product.

## Licensing your contribution

Content under CC BY 4.0, code under Apache-2.0. By opening a pull request you agree to these.

## First time?

Say so in your pull request. A maintainer will walk you through it. Everyone here had a first one.
