import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildMessages, extractAnswer, isCorrect, judge, parseItems } from '../src/eval/gsm8k.ts';
import { SUITES } from '../src/eval/suites.ts';

const definition = (id) => readFileSync(fileURLToPath(new URL(`../../web/src/content/benchmarks/${id}.md`, import.meta.url)), 'utf8');

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
  assert.equal(SUITES['gsm8k-200'].promptVersion, 'gsm8k-2');
  const [item] = SUITES['gsm8k-200'].items(`${JSON.stringify({ question: 'How many?', answer: 'w\n#### 4' })}\n`, 1);
  assert.deepEqual(item.messages, buildMessages('How many?'));
});

test('each suite sets its own token limit, and GSM8K needs to know how each reply ended', () => {
  assert.equal(SUITES['gsm8k-200'].maxTokens, 2048);
  assert.equal(SUITES['canary-injection-v1'].maxTokens, 512);
  assert.equal(SUITES['gsm8k-200'].needsEndSignal, true);
  assert.equal(SUITES['canary-injection-v1'].needsEndSignal, undefined);
});

test('the benchmark pages publish version 2 of the method: the prompt, the token limit and the cut-off rule', () => {
  const gsm8k = definition('gsm8k-200');
  assert.match(gsm8k, /^version: "2"$/m);
  assert.match(gsm8k, /^previous_versions: \["1"\]$/m);
  const { maxTokens } = SUITES['gsm8k-200'];
  assert.ok(gsm8k.includes(`\`${buildMessages('').at(0).content.trim()}\` Temperature 0, at most ${maxTokens} new tokens.`));
  assert.ok(gsm8k.includes(
    `A reply is cut off when the server reports the finish reason "length" for it, or reports that it generated at least ${maxTokens} tokens. `
    + 'A cut-off reply is wrong, whatever numbers it contains.',
  ));
  assert.ok(gsm8k.includes(
    'A reply for which the server reports neither a finish reason nor a token count cannot be scored: the run stops at that item and publishes nothing.',
  ));
  assert.match(gsm8k, /^- \*\*Token limit\.\*\* The 2048-token limit/m);
  assert.match(gsm8k, /^## Changes from version 1$/m);
  assert.doesNotMatch(gsm8k.split('## Changes from version 1')[0], /\b512\b/);

  // The speed benchmark is measured on those runs, so it moves to version 2 with them.
  const speed = definition('decode-speed-gsm8k-200');
  assert.match(speed, /^version: "2"$/m);
  assert.match(speed, /^previous_versions: \["1"\]$/m);
  assert.match(speed, new RegExp(`at most ${maxTokens} new tokens`));
  assert.match(speed, /^## Changes from version 1$/m);
  assert.doesNotMatch(speed.split('## Changes from version 1')[0], /\b512\b/);
});

test('a reply the server cut off at the token limit is wrong, whatever numbers it contains', () => {
  const [item] = SUITES['gsm8k-200'].items(`${JSON.stringify({ question: 'How many?', answer: 'w\n#### 18' })}\n`, 1);
  const reply = 'Nine eggs at $2 each is 18';
  const end = (finishReason, completionTokens) => ({ finishReason, completionTokens, maxTokens: 2048 });
  const cutOff = { correct: false, extracted: null };
  const right = { correct: true, extracted: '18' };

  // The server says so.
  assert.deepEqual(item.judge(reply, end('length', 300)), cutOff);
  assert.deepEqual(item.judge(reply, end('length', null)), cutOff);
  // Or the reply used the whole limit, whatever reason the server gives or omits.
  assert.deepEqual(item.judge(reply, end('max_tokens', 2048)), cutOff);
  assert.deepEqual(item.judge(reply, end('stop', 2048)), cutOff);
  assert.deepEqual(item.judge(reply, end(null, 2048)), cutOff);
  assert.deepEqual(item.judge(reply, end(null, 2049)), cutOff);

  // Anything else is judged as it stands: one signal is enough to know it was not cut off.
  assert.deepEqual(item.judge(reply, end('stop', 300)), right);
  assert.deepEqual(item.judge(reply, end('stop', null)), right);
  assert.deepEqual(item.judge(reply, end('max_tokens', 300)), right);
  assert.deepEqual(item.judge(reply, end(null, 2047)), right);
  assert.deepEqual(item.judge('It is 19', end(null, 300)), { correct: false, extracted: '19' });
  assert.deepEqual(item.judge('No idea', end('stop', 300)), { correct: false, extracted: null });

  // The limit is the one the reply was generated under, not a fixed number.
  assert.deepEqual(item.judge(reply, { finishReason: 'stop', completionTokens: 512, maxTokens: 512 }), cutOff);
  // Direct calls agree with the suite.
  assert.deepEqual(judge(reply, 18, end('length', 300)), cutOff);
  assert.deepEqual(judge(reply, 18, end('stop', 300)), right);
});
