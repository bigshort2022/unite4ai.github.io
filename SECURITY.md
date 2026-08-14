# Security policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Use GitHub's private vulnerability reporting: [open a private advisory](../../security/advisories/new).
We aim to acknowledge within 72 hours.

## Scope

This is a static site with no server, no database, and no user accounts. The realistic attack
surface is:

- **Supply chain** — a malicious dependency or a compromised GitHub Action
- **Content injection** — a submission carrying malicious markup or a hostile artifact URL
- **Repository access** — compromised maintainer credentials

All three are in scope and taken seriously.

## What we do

- Actions are pinned to major versions and reviewed on update
- Dependabot is enabled for dependencies and Actions
- `main` is protected: no direct pushes, required review, required status checks
- Deploy tokens are scoped per-run via OIDC; no long-lived secrets in the repo
- CSP is set via meta tag (GitHub Pages cannot set HTTP headers — a documented limitation)
