import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMessages, extractAnswer, isCorrect, parseItems } from '../src/eval/gsm8k.ts';
import { SUITES } from '../src/eval/suites.ts';

const line = (question, answer) => JSON.stringify({ question, answer });
const SOURCE = [
  line('Q1?', 'Working.\n#### 18'),
  line('Q2?', 'Working.\n#### 2,125'),
  line('Q3?', 'Working.\n#### -4'),
  line('Q4?', 'Working.\n#### 0.5'),
].join('\n') + '\n';

test('parseItems takes the first N items in file order and reads the number after ####', () => {
  const items = parseItems(SOURCE, 3);
  assert.deepEqual(items.map((i) => [i.index, i.question, i.expected]), [[0, 'Q1?', 18], [1, 'Q2?', 2125], [2, 'Q3?', -4]]);
});

test('parseItems refuses a source that is too short or malformed', () => {
  assert.throws(() => parseItems(SOURCE, 5), /has 4 items; the benchmark needs 5/);
  assert.throws(() => parseItems(line('Q?', 'no marker') + '\n', 1), /item 1/);
});

test('extractAnswer takes the last number in the reply', () => {
  assert.equal(extractAnswer('9 eggs at $2 each is 18.\n#### 18'), 18);
  assert.equal(extractAnswer('The total is $2,125.'), 2125);
  assert.equal(extractAnswer('So the answer is **3.50** dollars'), 3.5);
  assert.equal(extractAnswer('It drops to -4 degrees'), -4);
  assert.equal(extractAnswer('Between 2-5 items, so 5'), 5);
  assert.equal(extractAnswer('I cannot solve this.'), null);
});

test('extractAnswer ignores numbers inside a think block', () => {
  assert.equal(extractAnswer('<think>maybe 99</think>The answer is 7'), 7);
  assert.equal(extractAnswer('<think>only thoughts 5</think>'), null);
});

test('extractAnswer treats a think block that is never closed as running to the end', () => {
  assert.equal(extractAnswer('<think>so it is 42'), null);
  assert.equal(extractAnswer('The answer is 7 <think>or maybe 9'), 7);
  assert.equal(extractAnswer('<think>first 3</think>The answer is 7 <think>or maybe 9'), 7);
});

test('LaTeX thousands separators are read between digits, in the reply and in the reference', () => {
  assert.equal(extractAnswer('The total is $1{,}234$.'), 1234);
  assert.equal(extractAnswer('The total is $1\\,234$.'), 1234);
  assert.equal(extractAnswer('So $12{,}345\\,678.5$'), 12345678.5);
  assert.equal(extractAnswer('The pair is (3, 4)'), 4);
  assert.equal(extractAnswer('Either 3 \\, 4'), 4);
  assert.equal(isCorrect('It costs $2{,}125$ dollars', 2125), true);
  assert.equal(parseItems(`${line('Q?', 'w\n#### 1{,}234')}\n`, 1)[0].expected, 1234);
});

test('isCorrect compares numerically, so 18 and 18.0 match and a missing answer is wrong', () => {
  assert.equal(isCorrect('#### 18.0', 18), true);
  assert.equal(isCorrect('#### 19', 18), false);
  assert.equal(isCorrect('no idea', 18), false);
});

test('the prompt is the question, a blank line and the published instruction; the registry knows gsm8k-200', () => {
  assert.deepEqual(buildMessages('How many?'), [{
    role: 'user',
    content: 'How many?\n\nSolve this step by step. Finish with the final answer as a number on its own line.',
  }]);
  assert.equal(SUITES['gsm8k-200'].promptVersion, 'gsm8k-1');
  const [item] = SUITES['gsm8k-200'].items(`${JSON.stringify({ question: 'How many?', answer: 'w\n#### 4' })}\n`, 1);
  assert.deepEqual(item.messages, buildMessages('How many?'));
});
