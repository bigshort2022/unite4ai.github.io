import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SUITES } from '../../cli/src/eval/suites.ts';

const TEMPLATES = new URL('../../../.github/ISSUE_TEMPLATE/', import.meta.url);
const source = readFileSync(new URL('submit-eval-result.yml', TEMPLATES), 'utf8');
const template = Bun.YAML.parse(source);
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
  // Only a model that already has a card can be scored, so the form sends the others to the model form.
  assert.equal(
    field('model').attributes.description,
    'The model\'s card id on this site. The model must already have a card: if it does not, file "Submit a model" first.',
  );
  assert.equal(Bun.YAML.parse(readFileSync(new URL('submit-model.yml', TEMPLATES), 'utf8')).name, 'Submit a model');
  assert.equal(field('result').type, 'textarea');
  assert.equal(field('result').attributes.render, 'json');
  assert.equal(
    field('result').attributes.description,
    'Paste the file the runner wrote, unchanged; if the run wrote two files (gsm8k-200 also writes a decode-speed '
    + 'file when speed was measured), paste both, one after the other.',
  );

  const confirmations = field('terms').attributes.options;
  assert.deepEqual(confirmations.map((option) => option.label), [
    'I ran this myself with bun run eval and did not edit the result file.',
    'run.submitter in the file is the GitHub handle I am filing this issue with.',
    'I kept the transcript and will share it if a maintainer asks.',
    'I agree to license this result under CC BY 4.0.',
  ]);
  // The other templates write "license"; this one does too.
  assert.doesNotMatch(source, /licence/i);
  assert.ok(confirmations.every((option) => option.required === true));
});
