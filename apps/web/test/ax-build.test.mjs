import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { checkAxBuild } from '../scripts/check-ax-build.mjs';
import { AX_RULES, axPage, renderAxTask } from '../src/lib/ax-task.mjs';

const rules = AX_RULES.map((rule) => `- ${rule}`).join('\n');
const site = 'https://example.org';
const base = '/project';
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'ax-artifact-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const write = (path, text) => {
    const target = join(dir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  };
  const page = axPage('/project/exchange/', base);
  const prompt = renderAxTask(page, { site, base }).text;
  const escape = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const pageHtml = (text) => `<button data-ax-toggle>AX</button><textarea data-ax-prompt>${escape(text)}</textarea>`;
  write('exchange/index.html', pageHtml(prompt));
  write('data/exchange.json', '{}');
  write('data/evals.json', '{}');
  write('llms.txt', `# Agent index\n\n${rules}\n\n- [Exchange](${site}${base}/exchange/)\n`);
  return { write, prompt, pageHtml, check: () => checkAxBuild({ dir, site, base }) };
}

test('verification follows actual artifacts under a project-site base and fails on a broken site link', async (t) => {
  const { write, prompt, pageHtml, check } = fixture(t);
  await check();
  write('exchange/index.html', pageHtml(`${prompt}\n${site}${base}/data/not-built.json\n`));
  await assert.rejects(check(), /not-built\.json/);
});

test('verification rejects an AX surface on the wrong route and missing prompts on eligible routes', async (t) => {
  const { write, prompt, pageHtml, check } = fixture(t);
  write('school/index.html', pageHtml(prompt));
  await assert.rejects(check(), /school/);
  write('school/index.html', '<main>School</main>');
  write('evals/bfcl-multiple-50/index.html', '<main>Benchmark</main>');
  await assert.rejects(check(), /bfcl-multiple-50/);
});

test('verification rejects a modified rule or unmanifested command in a generated prompt', async (t) => {
  const { write, prompt, pageHtml, check } = fixture(t);
  write('exchange/index.html', pageHtml(prompt.replace(AX_RULES[0], 'A conflicting rule.')));
  await assert.rejects(check(), /rules/i);
  write('exchange/index.html', pageHtml(prompt.replace('unite4ai-axi next', 'unite4ai-axi next --not-a-real-flag')));
  await assert.rejects(check(), /AX command/);
  for (const line of ['  unite4ai-axi next --not-a-real-flag', '$ unite4ai-axi next --not-a-real-flag',
    'For more info, run `unite4ai-axi next --not-a-real-flag`.']) {
    write('exchange/index.html', pageHtml(prompt.replace('unite4ai-axi next', line)));
    await assert.rejects(check(), /AX command/);
  }
});
