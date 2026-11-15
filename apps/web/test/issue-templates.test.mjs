import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SUITES } from '../../cli/src/eval/suites.ts';

const template = Bun.YAML.parse(
  readFileSync(new URL('../../../.github/ISSUE_TEMPLATE/submit-eval-result.yml', import.meta.url), 'utf8'),
);
const field = (id) => template.body.find((entry) => entry.id === id);

test('the evaluation result form is labelled as a submission and offers exactly the benchmarks the runner can run', () => {
  assert.equal(template.name, 'Submit an evaluation result');
  assert.match(template.description, /maintainer turns .* into a pull request/);
  assert.equal(template.title, '[Eval] ');
  assert.deepEqual(template.labels, ['submission', 'evaluation']);

  // A benchmark the runner cannot run has no result to paste, and a runnable one must be offered.
  const benchmark = field('benchmark');
  assert.equal(benchmark.type, 'dropdown');
  assert.deepEqual([...benchmark.attributes.options].sort(), Object.keys(SUITES).sort());
});

test('the form requires the model, the benchmark, the result file and every confirmation', () => {
  const ids = template.body.filter((entry) => entry.type !== 'markdown').map((entry) => entry.id);
  assert.deepEqual(ids, ['model', 'benchmark', 'result', 'transcript', 'notes', 'terms']);
  assert.deepEqual(
    ids.filter((id) => field(id).validations?.required === true),
    ['model', 'benchmark', 'result'],
  );
  assert.equal(field('result').type, 'textarea');
  assert.equal(field('result').attributes.render, 'json');

  const confirmations = field('terms').attributes.options;
  assert.deepEqual(confirmations.map((option) => option.label), [
    'I ran this myself with bun run eval and did not edit the result file.',
    'I kept the transcript and will share it if a maintainer asks.',
    "The model's licence is on the allowlist, or I have said above that I am not sure.",
    'I agree to license this result under CC BY 4.0.',
  ]);
  assert.ok(confirmations.every((option) => option.required === true));
});
