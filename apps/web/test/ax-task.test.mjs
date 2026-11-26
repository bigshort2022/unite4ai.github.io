import assert from 'node:assert/strict';
import test from 'node:test';
import { AX_RULES, axPage, renderAxTask, validateAxCommand, validateAxManifest } from '../src/lib/ax-task.mjs';

const HASH = '1234567890abcdef'.repeat(4);
const render = (path, options) => renderAxTask(axPage(path), options).text;

test('AX only classifies the five eligible page types, including project-site URLs', () => {
  for (const [path, kind] of [
    ['/exchange/', 'exchange'], ['/exchange/hypotheses/pair-study', 'hypothesis'],
    ['/exchange/findings/pair-study/', 'finding'], ['/registry/models/qwen3-8-27b', 'model'],
    ['/evals/bfcl-multiple-50', 'benchmark'],
  ]) {
    assert.equal(axPage(path)?.kind, kind);
    assert.equal(axPage(`/hub${path}`, '/hub/')?.path, path.replace(/\/$/, ''));
    assert.equal(axPage(path, '/hub/'), null);
  }
  for (const path of ['/', '/exchange/biases', '/evals', '/registry/models', '/registry/datasets/a',
    '/exchange/findings/a/b', '/exchange/findings/a%2Fb', '/exchange/findings/a;echo',
    '/exchange/findings/a?b=c', '/exchange//', '/registry/models/a%2Fb', '/evals/a#b']) {
    assert.equal(axPage(path), null, path);
  }
});

test('tasks derive exact identifiers, bind the finding hash, and grant no run or submit approval', () => {
  const samples = [
    ['/exchange', /unite4ai-axi next$/m],
    ['/exchange/hypotheses/pair-study', /unite4ai-axi finding draft .*--hypothesis pair-study\b/],
    ['/exchange/findings/pair-study', new RegExp(`unite4ai-axi review pair-study .*--finding-sha256 ${HASH}\\b`)],
    ['/registry/models/qwen3-8-27b', /unite4ai-axi run <BENCHMARK_ID> --model qwen3-8-27b\b/],
    ['/evals/bfcl-multiple-50', /unite4ai-axi run bfcl-multiple-50 --model <MODEL_CARD_ID>/],
  ];
  for (const [path, command] of samples) {
    const text = render(path, { findingHash: HASH, ignoredProse: 'NOT PART OF THE TASK' });
    assert.match(text, command);
    assert.doesNotMatch(text, /--confirm|NOT PART OF THE TASK/);
    for (const rule of AX_RULES) assert.ok(text.includes(rule), rule);
  }
  assert.match(render('/evals/bfcl-multiple-50'), /^unite4ai-axi replicate <RESULT_ID> /m);
  assert.throws(() => render('/exchange/findings/pair-study'), /SHA-256/);
  assert.throws(() => render('/exchange/findings/pair-study', { findingHash: `${HASH}\nmalformed` }), /SHA-256/);
  const page = axPage('/project/evals/bfcl-multiple-50/', '/project');
  const { text } = renderAxTask(page, { site: 'https://example.com', base: '/project/' });
  assert.match(text, /https:\/\/example\.com\/project\/evals\/bfcl-multiple-50/);
  assert.match(text, /https:\/\/example\.com\/project\/data\/evals\.json/);
});

test('measured pages run the scoring benchmark and unsupported model IDs never become commands', () => {
  const measured = render('/evals/decode-speed-gsm8k-200', { measuredOn: 'gsm8k-200' });
  assert.match(measured, /unite4ai-axi run gsm8k-200 --model /);
  assert.doesNotMatch(measured, /unite4ai-axi run decode-speed-gsm8k-200/);
  const published = render('/registry/models/vendor/my--model');
  assert.match(published, /vendor\/my--model/);
  assert.doesNotMatch(published, /unite4ai-axi run/);
  assert.match(published, /not an eligible evaluation ID/);
});

test('the manifest rejects unsupported, incomplete, duplicate and extra CLI arguments', () => {
  assert.doesNotThrow(() => validateAxManifest());
  assert.doesNotThrow(() => validateAxCommand(['finding', 'draft', '--id', 'draft-a', '--hypothesis', 'parent', '--results', '<RESULT_IDS>', '--verdict', '<VERDICT>', '--summary', '<SUMMARY>', '--limitations', '<LIMITATIONS>', '--date', '<DATE>', '--agent-model', '<AGENT_MODEL>', '--agent-harness', '<AGENT_HARNESS>']));
  const invalid = [
    ['unknown'], ['finding'], ['next', '--limit'], ['next', '--help', 'oops'],
    ['next', '--unknown'], ['next', '--limit', '2', '--limit', '3'], ['next', '--full', '2'],
    ['run', 'bfcl-multiple-50', '--server', 'mini', '--max-seconds', '600'],
    ['submit', '--record', '<RECORD_PATH>', '--confirm'], ['prompt', '/exchange', 'extra'],
    ['run', 'bad;entry', '--model', 'x', '--server', 'mini', '--max-seconds', '600'],
  ];
  for (const args of invalid) assert.throws(() => validateAxCommand(args), /AX command/, args.join(' '));
});
