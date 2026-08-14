---
title: Why our entire platform is a public repository
summary: Building the anti-open-washing platform behind a closed codebase would have been a self-refuting act. Here's the architecture that follows from taking that seriously.
author: unite4ai-team
published: 2026-08-01
tags: ["governance", "engineering", "open-source"]
---

We built Unite4AI to challenge open-washing — the practice of marketing restrictive AI systems
with the vocabulary of open source. It follows that we cannot ask anyone to take our word for
anything.

So we made a constraint into an architecture: **every part of this platform is a public file in a
repository you can fork right now.** Content, course material, governance rules, deployment
pipeline, and the code you are reading this through.

## What that decision actually forces

**The database is git.** Every model card and course is a plain text file with a schema. Version
history is provenance, `git blame` is attribution, and a bad merge is one revert away from fixed.
No proprietary CMS holds the community's work hostage.

**Contribution is the API.** There is no admin panel where privileged people quietly change things.
A pull request is the only write path — including for us. Our own changes get reviewed in public.

**Ethics are compiled, not promised.** Our schema makes consent basis, PII review, and bias notes
*required* fields on dataset cards, and our license allowlist rejects restrictive licenses in CI.
A promise on an About page can be quietly abandoned during a funding crunch. A build check has to
be deleted in a commit with your name on it.

**Privacy is structural.** Static files, client-side search, no cookies, no user table. We cannot
sell data we never collect, and you can verify that claim in your browser's network tab rather
than trusting our policy page.

## The uncomfortable part

Building this way means our mistakes are public too — every abandoned experiment, every slow
review, every awkward commit message. We think that trade is obviously correct. A platform arguing
for transparency in AI that couldn't survive transparency about itself would be arguing against
its own thesis.

If any of this appeals to you, the fastest way in isn't an application form. It's a pull request.
