import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { validateContent } from '../src/validate.ts';
import { hypothesis, finding, review, hash, markdown, makeExchangeRoot } from './fixtures/exchange.mjs';
import { readExchangeRecords } from '../src/read-exchange.ts';

// Oracle: approved exchange design, strict authored objects. A typed-in status must not pass.
test('the content gate rejects an authored hypothesis status', async () => {
  const root = makeExchangeRoot({ hypotheses: { 'fixture-hypothesis': hypothesis({ status: 'supported' }) } });
  try {
    const { errors } = await validateContent(root);
    assert.ok(errors.some((error) => error.includes('hypotheses/fixture-hypothesis.md') && error.includes('status')), errors.join('\n'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


test('empty exchange and a real file-backed review pass; byte changes invalidate that review', async () => {
  const findingBytes = JSON.stringify(finding(), null, 2);
  const root = makeExchangeRoot({
    hypotheses: { 'fixture-hypothesis': hypothesis({ grafts: [{ finding: 'fixture-finding', sha256: hash(findingBytes), note: 'Fixture use.' }] }) },
    findings: { 'fixture-finding': findingBytes },
    reviews: { 'fixture-finding--fixture-reviewer--2026-11-11': review(findingBytes) },
  });
  try {
    assert.deepEqual((await validateContent(root)).errors, []);
    const loaded = await readExchangeRecords(root, (frontmatter) => Bun.YAML.parse(frontmatter));
    assert.equal(loaded.records.findings[0].sha256, hash(findingBytes));
    // JSON meaning is unchanged. Reviews and grafts must still pin the exact original bytes.
    appendFileSync(join(root, 'findings/fixture-finding.json'), '\n');
    const changed = (await validateContent(root)).errors.join('\n');
    assert.match(changed, /finding_sha256 does not match/);
    assert.match(changed, /graft sha256 does not match/);
    for (const dir of ['hypotheses', 'findings', 'reviews']) rmSync(join(root, dir), { recursive: true });
    assert.deepEqual((await validateContent(root)).errors, []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('flat content directories refuse nested files, links, MDX, stray extensions and invalid ids', async () => {
  const root = makeExchangeRoot();
  try {
    mkdirSync(join(root, 'findings/nested'));
    writeFileSync(join(root, 'findings/nested/hidden.json'), JSON.stringify(finding()));
    writeFileSync(join(root, 'hypotheses/executable.mdx'), markdown(hypothesis()));
    writeFileSync(join(root, 'reviews/stray.txt'), 'fixture');
    writeFileSync(join(root, 'hypotheses/Upper.md'), markdown(hypothesis()));
    symlinkSync(join(root, 'hypotheses/fixture-hypothesis.md'), join(root, 'hypotheses/linked.md'));
    const errors = (await validateContent(root)).errors.join('\n');
    for (const file of ['findings/nested', 'hypotheses/executable.mdx', 'reviews/stray.txt', 'hypotheses/Upper.md', 'hypotheses/linked.md']) assert.ok(errors.includes(file), errors);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('records reject prose bodies, malformed JSON, invalid UTF-8, oversize bytes and future dates', async () => {
  const root = makeExchangeRoot({
    hypotheses: {
      'fixture-body': markdown(hypothesis(), 'Unbounded prose must not bypass the text fields.'),
      'fixture-date': hypothesis({ date: '9999-01-01' }),
      'fixture-delimiter': '---\n+++\n---\n',
    },
    findings: { 'fixture-json': '{bad', 'fixture-large': ' '.repeat(16385) },
  });
  try {
    writeFileSync(join(root, 'reviews/fixture-invalid.json'), Buffer.from([0xff]));
    const errors = (await validateContent(root)).errors.join('\n');
    for (const message of [/Markdown body must be empty/, /date is in the future/, /requires YAML frontmatter/, /fixture-json.*cannot parse/, /16384-byte record limit/, /fixture-invalid.*cannot parse/]) assert.match(errors, message);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// Oracle: a YAML 1.2 parser keeps an unquoted date as a string, as authors write in every other card.
test('the gate accepts a hypothesis with an unquoted YAML date and keeps it as YYYY-MM-DD', async () => {
  const root = makeExchangeRoot({ hypotheses: { 'fixture-hypothesis': `---
title: Fixture hypothesis
claim: Fixture model reaches the threshold.
benchmark: bench-a
models: [model-a]
prediction: Fixture score exceeds 70.
author: fixture-author
date: 2026-11-10
---
` } });
  try {
    assert.deepEqual((await validateContent(root)).errors, []);
    const loaded = await readExchangeRecords(root, (frontmatter) => Bun.YAML.parse(frontmatter));
    assert.equal(loaded.records.hypotheses[0].data.date, '2026-11-10');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
