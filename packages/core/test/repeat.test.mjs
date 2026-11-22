import assert from 'node:assert/strict';
import test from 'node:test';
import { bootstrapPass1Percent, repeatProblems, repeatSummary, tallyAttempts, wilsonPercent } from '../src/repeat.ts';

const METHOD = { runs: 3, temperature: 0.7, top_p: 1 };

/** Three items, three runs: items 0 and 1 right every time, item 2 right only in the second run. */
function attempts({ completionTokens = 10 } = {}) {
  return [0, 1, 2, 3, 4, 5, 6, 7, 8].map((position) => ({
    run: Math.floor(position / 3),
    index: position % 3,
    correct: position % 3 !== 2 || position === 5,
    seconds: 1,
    promptTokens: 20,
    completionTokens,
  }));
}

test('Wilson intervals are percentages with two decimals, clamped to 0 and 100', () => {
  assert.deepEqual(wilsonPercent(2, 4), [15, 85]);
  assert.deepEqual(wilsonPercent(45, 50), [78.64, 95.65]);
  assert.deepEqual(wilsonPercent(50, 50), [92.87, 100]);
  const [low, high] = wilsonPercent(0, 50);
  assert.ok(Object.is(low, 0), 'no negative zero');
  assert.equal(high, 7.13);
});

test('the pass@1 bootstrap is seeded, so every machine gets the same interval', () => {
  assert.deepEqual(bootstrapPass1Percent([10, 0, 0, 0, 0, 40], 5), [68, 90]);
  assert.deepEqual(bootstrapPass1Percent([10, 0, 0, 0, 0, 40], 5), [68, 90]);
  assert.deepEqual(bootstrapPass1Percent([0, 0, 0, 0, 0, 50], 5), [100, 100]);
  assert.deepEqual(bootstrapPass1Percent([0, 1, 0, 2], 3), [33.33, 100]);
});

test('answers are tallied per item and per run; a missing token count leaves that total out', () => {
  assert.deepEqual(tallyAttempts(attempts(), 3, 3), {
    item_pass_histogram: [0, 1, 0, 2],
    run_correct: [2, 3, 2],
    seconds_total: 9,
    prompt_tokens_total: 180,
    completion_tokens_total: 90,
  });
  const untimed = attempts();
  untimed[4] = { ...untimed[4], completionTokens: null };
  assert.equal('completion_tokens_total' in tallyAttempts(untimed, 3, 3), false);
  assert.throws(() => tallyAttempts(attempts().slice(1), 3, 3), /8 answers; 3 runs of 3 items need 9/);
});

test('the summary derives every rate and interval from the counts', () => {
  assert.deepEqual(repeatSummary(METHOD, tallyAttempts(attempts(), 3, 3)), {
    runs: 3,
    temperature: 0.7,
    top_p: 1,
    item_pass_histogram: [0, 1, 0, 2],
    run_correct: [2, 3, 2],
    pass_1: 77.78,
    pass_1_ci: [33.33, 100],
    pass_k: 66.67,
    pass_k_ci: [20.77, 93.85],
    run_score_sd: 19.25,
    seconds_total: 9,
    seconds_per_success: 1.286,
    prompt_tokens_total: 180,
    completion_tokens_total: 90,
    prompt_tokens_per_success: 25.7,
    completion_tokens_per_success: 12.9,
  });
});

test('with no correct answer there is no per-success figure', () => {
  const none = repeatSummary(METHOD, { item_pass_histogram: [3, 0, 0, 0], run_correct: [0, 0, 0], seconds_total: 9 });
  assert.equal(none.pass_k, 0);
  assert.equal('seconds_per_success' in none, false);
});

test('a repeat block is checked against its own counts', () => {
  const good = repeatSummary(METHOD, tallyAttempts(attempts(), 3, 3));
  assert.deepEqual(repeatProblems(good, 3), []);
  assert.deepEqual(repeatProblems({ ...good, pass_1: 99 }, 3), ['repeat.pass_1 is 99; the counts give 77.78']);
  assert.deepEqual(repeatProblems({ ...good, seconds_per_success: undefined }, 3), ['repeat.seconds_per_success is absent; the counts give 1.286']);
  assert.deepEqual(repeatProblems({ ...good, item_pass_histogram: [0, 1, 2] }, 3), [
    'repeat.item_pass_histogram must have 4 entries, one for each number of runs an item can pass (0 to 3)',
  ]);
  assert.deepEqual(repeatProblems({ ...good, run_correct: [2, 3] }, 3), ['repeat.run_correct must have 3 entries, one per run']);
  assert.deepEqual(repeatProblems(good, 4), ['repeat.item_pass_histogram counts 3 items; the result has n = 4']);
  assert.deepEqual(repeatProblems({ ...good, run_correct: [2, 2, 2] }, 3), [
    'repeat.run_correct adds up to 6 correct answers; repeat.item_pass_histogram gives 7',
  ]);
  assert.deepEqual(repeatProblems({ ...good, run_correct: [1, 3, 3] }, 3), [
    'each repeat.run_correct entry must be between 2 (items right on every run) and 3 (items right on any run)',
  ]);
});
