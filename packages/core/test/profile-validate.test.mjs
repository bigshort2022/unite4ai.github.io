import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { readExchangeProfiles, validateProfiles } from '../src/profiles.ts';
import { validateContent } from '../src/validate.ts';
import { profile } from './fixtures/profile.mjs';

const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
function root(files, directoryIds = ['akash', 'vast-ai']) {
  const r = mkdtempSync(join(tmpdir(), 'u4ai-profiles-'));
  dirs.push(r);
  mkdirSync(join(r, 'content', 'exchange-profiles'), { recursive: true });
  mkdirSync(join(r, 'data'), { recursive: true });
  writeFileSync(join(r, 'data', 'global-exchange.json'), JSON.stringify({ projects: directoryIds.map((id) => ({ id })) }));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(r, 'content', 'exchange-profiles', name), typeof body === 'string' ? body : JSON.stringify(body));
  return join(r, 'content');
}
const ids = new Set(['akash', 'vast-ai']);
const entry = (data, id = 'akash') => ({ id, data, sha256: '0'.repeat(64) });

test('a valid profile has no cross-reference errors', () => {
  assert.deepEqual(validateProfiles([entry(profile())], ids), []);
});

test('the file name must equal the directory id, and the id must be in the directory', () => {
  assert.match(validateProfiles([entry(profile(), 'vast-ai')], ids).join('\n'), /directoryId/);
  const p = profile({ meta: { ...profile().meta, directoryId: 'not-listed' } });
  assert.match(validateProfiles([entry(p, 'not-listed')], ids).join('\n'), /not in the Global Exchange directory/);
});

test('every cited evidence id must exist, and every evidence item must be cited', () => {
  const p = profile();
  p.identity.officialUrl.evidence = ['e99'];
  p.evidence.push({ ...p.evidence[0], id: 'e8' });
  const errors = validateProfiles([entry(p)], ids).join('\n');
  assert.match(errors, /e99/);
  assert.match(errors, /e8: not cited/);
});

test('criteria must belong to the right rubric and appear once', () => {
  const p = profile();
  p.securityChecks.push({ criterion: 'custodial-funds', outcome: 'pass', evidence: ['e1'] });
  p.riskChecks.push({ ...p.riskChecks[0] });
  const errors = validateProfiles([entry(p)], ids).join('\n');
  assert.match(errors, /custodial-funds.*security rubric/);
  assert.match(errors, /custodial-funds.*more than once/);
});

test('market data must be reported, and quotes must name a reference workload', () => {
  const p = profile();
  p.marketData.marketCapUsd.level = 'stated';
  p.priceQuotes[0].workload = 'mystery-unit';
  const errors = validateProfiles([entry(p)], ids).join('\n');
  assert.match(errors, /marketCapUsd.*reported/);
  assert.match(errors, /mystery-unit/);
});

test('the content gate reads the directory beside the content root and reports bad files', async () => {
  const content = root({ 'akash.json': profile(), 'broken.json': '{not json', 'Bad Name.json': profile() });
  const { errors } = await validateContent(content);
  const text = errors.join('\n');
  assert.match(text, /broken\.json: cannot parse/);
  assert.match(text, /Bad Name\.json: filename must be a lowercase id/);
  assert.doesNotMatch(text, /akash\.json/);
});

test('reading skips nothing silently: oversize files are errors', async () => {
  const big = profile();
  big.evidence[0].quote = 'x'.repeat(499);
  const padded = JSON.stringify(big).padEnd(40 * 1024, ' ');
  const { errors } = await readExchangeProfiles(root({ 'akash.json': padded }));
  assert.match(errors.join('\n'), /byte record limit/);
});
