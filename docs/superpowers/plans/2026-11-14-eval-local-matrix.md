# Local-Run Matrix and Efficiency Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Speed becomes a first-class, comparable result: an efficiency leaderboard ranked per hardware setup, and a per-model matrix of the setups it runs on with speed and time to first token (milestone M4 of `2026-11-14-eval-hub-long-horizon.md`).

**Architecture:** Speed is published as its own *measured* benchmark result, derived from the same run and the same transcript as the quality result, so it reuses the whole pipeline (schema, gate, pages, feed). Because a speed number only means something on a given machine, groups of measured benchmarks are additionally keyed by hardware. Nothing is estimated: a run that did not measure speed produces no speed result.

**Tech Stack:** Bun 1.4, Zod 4, Astro 7, the runner in `apps/cli/src/eval/`, `node:test` API run by `bun test`.

## Global constraints

- No estimates and no energy figures: only quantities the runner measured.
- A speed result carries the same `evidence.sha256` as the quality result it came from; the gate allows one evidence hash per *benchmark*, not per repository.
- Quality benchmarks keep their grouping (hardware does not change a score); measured benchmarks are grouped per device.
- No new dependencies; tests never contact a model server.

## File map

| Path | Responsibility |
|---|---|
| `packages/core/src/evals.ts` | `groupEvals(runs, { byHardware })`; `EvalGroup.device`/`memory_gb`; `LocalSetup.time_to_first_token_ms` |
| `packages/core/src/validate-evals.ts` | Duplicate evidence is an error only within one benchmark |
| `packages/core/test/evals.test.mjs`, `validate-evals.test.mjs` | Tests |
| `apps/web/src/content/benchmarks/decode-speed-gsm8k-200.md` | The measured benchmark definition |
| `apps/cli/src/eval/speed.ts` | `speedResultFrom(main, speedBenchmark)`: pure derivation |
| `apps/cli/src/eval/suites.ts`, `run.ts` | `Suite.speedBenchmark`; the runner writes the second file |
| `apps/web/src/lib/evals.ts`, `pages/evals/*.astro`, `pages/registry/models/[...id].astro`, `pages/data/evals.json.ts` | Per-device rows; matrix with time to first token |
| `apps/web/test/fixtures/evals/*`, `apps/web/test/evals-pages.test.mjs`, `apps/cli/test/*` | Tests |

---

### Task 1: Core — hardware-aware groups, matrix TTFT, evidence scope

**Files:**
- Modify: `packages/core/src/evals.ts`, `packages/core/src/validate-evals.ts`, `packages/core/test/evals.test.mjs`, `packages/core/test/validate-evals.test.mjs`

**Interface after this task:**

```ts
interface EvalGroup { /* existing fields */ device: string | null; memory_gb: number | null }
interface LocalSetup { /* existing fields */ time_to_first_token_ms: number | null }
groupEvals(runs: EvalRun[], options?: { byHardware?: ReadonlySet<string> }): EvalGroup[]
```

`byHardware` is a set of benchmark ids. For runs of those benchmarks the group key is the JSON of `[model, benchmark, benchmark_version, format, quantization, device, accelerator, memory_gb]` and the group's `device` and `memory_gb` are set; for all other runs the key and behaviour are exactly as today and both fields are `null`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/test/evals.test.mjs` (it already imports `groupEvals`, `leaderboard`, `localSetups`, and the `run`/`result` fixtures; `setup(overrides)` and `by(submitter, date)` helpers exist at the top of the file):

```js
const hardware = (overrides = {}) => ({ ...result().setup.hardware, ...overrides });

test('measured benchmarks are grouped per device; other benchmarks are not', () => {
  const runs = [
    run('q1', { benchmark: 'bench-a', score: 60 }),
    run('q2', { benchmark: 'bench-a', score: 70, setup: setup({ hardware: hardware({ device: 'Other Box', accelerator: 'nvidia', memory_gb: 24 }) }) }),
    run('s1', { benchmark: 'speed-a', score: 40 }),
    run('s2', { benchmark: 'speed-a', score: 90, setup: setup({ hardware: hardware({ device: 'Other Box', accelerator: 'nvidia', memory_gb: 24 }) }) }),
    run('s3', { benchmark: 'speed-a', score: 44, run: by('bob', '2026-11-12') }),
  ];
  const groups = groupEvals(runs, { byHardware: new Set(['speed-a']) });

  const quality = groups.filter((g) => g.benchmark === 'bench-a');
  assert.equal(quality.length, 1, 'a score does not depend on the machine');
  assert.equal(quality[0].device, null);
  assert.equal(quality[0].memory_gb, null);

  const speed = groups.filter((g) => g.benchmark === 'speed-a');
  assert.equal(speed.length, 2);
  const laptop = speed.find((g) => g.device === 'MacBook Pro (M2 Max)');
  assert.deepEqual(laptop.run_ids, ['s1', 's3']);
  assert.equal(laptop.score, 42);
  assert.equal(laptop.memory_gb, 32);
  assert.deepEqual(laptop.submitters, ['alice', 'bob']);
  const box = speed.find((g) => g.device === 'Other Box');
  assert.equal(box.score, 90);
  assert.equal(box.memory_gb, 24);
});

test('devices that differ only in memory are separate measured groups', () => {
  const groups = groupEvals([
    run('a', { benchmark: 'speed-a', score: 40 }),
    run('b', { benchmark: 'speed-a', score: 50, setup: setup({ hardware: hardware({ memory_gb: 64 }) }) }),
  ], { byHardware: new Set(['speed-a']) });
  assert.deepEqual(groups.map((g) => g.memory_gb).sort((x, y) => x - y), [32, 64]);
});

test('without the option every benchmark groups as before', () => {
  const groups = groupEvals([
    run('a', { benchmark: 'speed-a', score: 40 }),
    run('b', { benchmark: 'speed-a', score: 50, setup: setup({ hardware: hardware({ device: 'Other Box' }) }) }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].device, null);
});

test('localSetups reports the lowest measured time to first token per setup', () => {
  const setups = localSetups([
    run('a', { perf: { tokens_per_second: 40, time_to_first_token_ms: 900 } }),
    run('b', { perf: { tokens_per_second: 55, time_to_first_token_ms: 650.5 } }),
    run('c', { setup: setup({ format: 'gguf', quantization: 'Q4_K_M', runtime: 'llama.cpp' }) }),
  ]);
  const mlx = setups.find((s) => s.format === 'mlx');
  assert.equal(mlx.time_to_first_token_ms, 650.5);
  assert.equal(mlx.tokens_per_second, 55);
  assert.equal(setups.find((s) => s.format === 'gguf').time_to_first_token_ms, null);
});
```

In `packages/core/test/validate-evals.test.mjs`, find the existing duplicate-evidence test and add a second test next to it. It needs two benchmarks in the temp root; use the file's `makeRoot`, `benchmark` and `result` helpers and its filename convention (`<model>--<benchmark>--<submitter>--<date>--<first 8 hex of evidence.sha256>.json`; the fixture hash is 64 `a`s):

```js
test('one transcript may back results for two different benchmarks, but not two for the same one', async () => {
  const speed = benchmark({ category: 'efficiency', scoring: 'measured', items: 0, metric: { name: 'decode speed', unit: ' tok/s', higher_is_better: true, min: 0 } });
  const errors = await errorsFor({
    benchmarks: { 'bench-a': benchmark(), 'speed-a': speed },
    evals: {
      'model-a--bench-a--alice--2026-11-10--aaaaaaaa.json': result(),
      'model-a--speed-a--alice--2026-11-10--aaaaaaaa.json': result({ benchmark: 'speed-a', score: 88.5, n: 200 }),
    },
  });
  assert.deepEqual(errors, []);
});
```

(If `errorsFor`/`makeRoot` have different names or signatures in the file by now, adapt the call to them; the two-file content is what matters. The existing same-benchmark duplicate test must keep passing unchanged.)

- [ ] **Step 2: Run and confirm failure**

Run: `bun test packages/core/test/evals.test.mjs packages/core/test/validate-evals.test.mjs`
Expected: the four new aggregation tests fail (`device` is `undefined`, two groups expected, `time_to_first_token_ms` undefined); the new validator test fails with a "same evidence.sha256" error.

- [ ] **Step 3: Implement**

In `packages/core/src/evals.ts`:

- `EvalGroup` gains, after `quantization`:

```ts
  /** Set only for benchmarks grouped by hardware (measured quantities); null otherwise. */
  device: string | null;
  memory_gb: number | null;
```

- `LocalSetup` gains `time_to_first_token_ms: number | null;` with the comment `/** Lowest measured; null when no run measured it. */`.

- `groupEvals` becomes:

```ts
export interface GroupOptions {
  /** Benchmark ids whose results only compare on the same machine (measured quantities such as speed). */
  byHardware?: ReadonlySet<string>;
}

export function groupEvals(runs: EvalRun[], options: GroupOptions = {}): EvalGroup[] {
  const buckets = new Map<string, EvalRun[]>();
  for (const run of runs) {
    const fields: (string | number)[] = [run.model, run.benchmark, run.benchmark_version, run.setup.format, run.setup.quantization];
    if (options.byHardware?.has(run.benchmark)) {
      const { device, accelerator, memory_gb } = run.setup.hardware;
      fields.push(device, accelerator, memory_gb);
    }
    const key = JSON.stringify(fields);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(run);
    else buckets.set(key, [run]);
  }
  // …the existing .map(...) body, with these two properties added after `quantization`:
  //   device: options.byHardware?.has(first.benchmark) ? first.setup.hardware.device : null,
  //   memory_gb: options.byHardware?.has(first.benchmark) ? first.setup.hardware.memory_gb : null,
  // …and the existing final sort, unchanged.
}
```

Keep the rest of the `.map` body and the sort exactly as they are. Export `GroupOptions` from `packages/core/src/index.ts` next to the other eval types.

- `localSetups`: track the lowest `run.perf?.time_to_first_token_ms` the same way the highest speed is tracked (initialise from the first run; replace when a later run's value is lower, or when the stored value is `null`).

In `packages/core/src/validate-evals.ts`, the duplicate-evidence check keeps a map from hash to the first file that used it. Key that map on `` `${result.benchmark}:${result.evidence.sha256}` `` instead of the hash alone, and leave the error text as it is.

- [ ] **Step 4: Run and confirm pass**

Run: `bun test packages/core/test && bun run validate`
Expected: all core tests pass (report the count); `✓ Content validation passed`.

Run: `apps/web/node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json`
Expected: exit 0. (Pages construct no `EvalGroup` or `LocalSetup` literals, so the new fields do not break them.)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/evals.ts packages/core/src/index.ts packages/core/src/validate-evals.ts packages/core/test/evals.test.mjs packages/core/test/validate-evals.test.mjs
git commit -m "Group measured benchmarks per device and allow one transcript to back two benchmarks"
```

---

### Task 2: Speed benchmark and runner output

**Files:**
- Create: `apps/web/src/content/benchmarks/decode-speed-gsm8k-200.md`, `apps/cli/src/eval/speed.ts`, `apps/cli/test/speed.test.mjs`
- Modify: `apps/cli/src/eval/suites.ts`, `apps/cli/src/eval/run.ts`, `apps/cli/test/run-eval.test.mjs`

- [ ] **Step 1: Write the failing tests**

`apps/cli/test/speed.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { evalResultSchema } from '@unite4ai/schema';
import { speedResultFrom } from '../src/eval/speed.ts';

const main = (overrides = {}) => ({
  schema_version: 1,
  model: 'model-a',
  benchmark: 'gsm8k-200',
  benchmark_version: '1',
  score: 71.5,
  n: 200,
  run: { date: '2026-11-10', submitter: 'alice', harness: { name: 'unite4ai-eval', version: '0.1.0' }, command: 'bun run eval -- --benchmark gsm8k-200' },
  setup: { runtime: 'mlx-lm', runtime_version: '0.32.2', format: 'mlx', quantization: '4bit', hardware: { device: 'Test Box', accelerator: 'cpu', memory_gb: 16 } },
  perf: { tokens_per_second: 88.4, time_to_first_token_ms: 412.5 },
  evidence: { sha256: 'a'.repeat(64), bytes: 1234 },
  ...overrides,
});

test('the speed result repeats the run, setup and evidence, with the measured speed as its score', () => {
  const speed = speedResultFrom(main(), { id: 'decode-speed-gsm8k-200', version: '1' });
  assert.equal(evalResultSchema.safeParse(speed).success, true);
  assert.equal(speed.benchmark, 'decode-speed-gsm8k-200');
  assert.equal(speed.benchmark_version, '1');
  assert.equal(speed.score, 88.4);
  assert.equal(speed.n, 200);
  assert.deepEqual(speed.run, main().run);
  assert.deepEqual(speed.setup, main().setup);
  assert.deepEqual(speed.evidence, main().evidence);
  assert.deepEqual(speed.perf, main().perf);
});

test('a run that did not measure speed has no speed result', () => {
  assert.equal(speedResultFrom(main({ perf: undefined }), { id: 'decode-speed-gsm8k-200', version: '1' }), null);
  assert.equal(speedResultFrom(main({ perf: { time_to_first_token_ms: 400 } }), { id: 'decode-speed-gsm8k-200', version: '1' }), null);
});
```

In `apps/cli/test/run-eval.test.mjs` add two tests using the file's existing workspace and stub helpers (their exact names may have changed in review; use what the file has):

1. The workspace also contains `benchmarks/decode-speed-gsm8k-200.md` (frontmatter as JSON: `category: 'efficiency'`, `scoring: 'measured'`, `items: 0`, `metric: { name: 'decode speed', unit: ' tok/s', higher_is_better: true, min: 0 }`, `version: '1'`, an https `source_url`, `license: 'apache-2.0'`, plus the other required fields). A complete run then writes **two** files in `evals/`; the outcome has `speedResultPath`; the second file's `benchmark` is `decode-speed-gsm8k-200`, its `score` equals the main result's `perf.tokens_per_second`, its `evidence.sha256` equals the main result's; `validateContent(contentRoot)` returns no errors.
2. Without that definition in the workspace (the default), a complete run writes one file and `speedResultPath` is `undefined`.

- [ ] **Step 2: Run and confirm failure**

Run: `bun test apps/cli/test/speed.test.mjs apps/cli/test/run-eval.test.mjs`
Expected: `speed.test.mjs` fails (module not found); the first new runner test fails (one file written).

- [ ] **Step 3: Implement**

`apps/cli/src/eval/speed.ts`:

```ts
import { evalResultSchema, type EvalResult } from '@unite4ai/schema';

/**
 * The speed measured during a run, published as its own result for a measured benchmark.
 * It is the same run: same command, setup and transcript evidence. Returns null when the
 * run did not measure decode speed, because nothing is ever estimated.
 */
export function speedResultFrom(main: EvalResult, speedBenchmark: { id: string; version: string }): EvalResult | null {
  const speed = main.perf?.tokens_per_second;
  if (typeof speed !== 'number') return null;
  return evalResultSchema.parse({
    ...main,
    benchmark: speedBenchmark.id,
    benchmark_version: speedBenchmark.version,
    score: speed,
  });
}
```

`apps/cli/src/eval/suites.ts`: add to `Suite`

```ts
  /** Id of the measured benchmark that publishes this suite's decode speed, when one is defined. */
  speedBenchmark?: string;
```

and set `speedBenchmark: 'decode-speed-gsm8k-200'` on the GSM8K suite.

`apps/cli/src/eval/run.ts`: `EvalOutcome` gains `speedResultPath?: string`. After the main result file is written, and only when `suite.speedBenchmark` is set **and** `benchmarks/<speedBenchmark>.md` exists under `contentRoot`: load that definition with the same function that loads the main one (frontmatter → `benchmarkSchema`), call `speedResultFrom(result, { id, version })`, and when it is not null write it to `evals/<model>--<speedBenchmark>--<submitter>--<date>--<first 8 hex of evidence.sha256>.json` in the same format as the main file. Return its path as `speedResultPath`. A speed definition that fails its schema is an error before any request (load it in preflight, write after the run).

`apps/web/src/content/benchmarks/decode-speed-gsm8k-200.md`:

```markdown
---
name: Decode speed on GSM8K-200
summary: Tokens generated per second, after the first token, while a model answers the GSM8K-200 items one at a time. Ranked per machine, because speed only compares on the same hardware.
category: efficiency
version: "1"
metric:
  name: decode speed
  unit: " tok/s"
  higher_is_better: true
  min: 0
scoring: measured
items: 0
source_url: https://github.com/bigshort2022/unite4ai.github.io/blob/main/apps/cli/src/eval/run.ts
license: apache-2.0
updated: 2026-11-14
---

## What it measures

How fast a local setup generates text: the model, its format and quantization, the runtime,
and the machine. It says nothing about answer quality; read it next to
[GSM8K (first 200)](/evals/gsm8k-200), which comes from the same run.

## Method

1. The runner answers the 200 GSM8K-200 items one request at a time, streaming, at
   temperature 0 with at most 512 new tokens.
2. For each request it records when the first generated token arrives and when the reply
   ends, and takes the number of generated tokens from the server's own usage count.
3. The score is the total number of generated tokens divided by the total time spent
   generating after the first token, across all 200 requests.
4. A run whose server reports no token count has no speed result. Nothing is estimated.

The result carries the same transcript hash as the quality result of that run.

## Known weaknesses

- **It depends on what else the machine was doing.** Other processes, memory pressure and
  thermal throttling all move the number. Treat a single run as indicative.
- **The token count is the server's.** Runtimes count tokens slightly differently, and the
  count includes end-of-sequence and any reasoning tokens.
- **One workload.** Short prompts and replies of a few hundred tokens; long-context
  throughput can differ.
- **No energy figure.** Power draw is not measured.

## Licence

The method is the runner's source code, Apache-2.0.
```

- [ ] **Step 4: Run and confirm pass**

Run: `bun test apps/cli/test && bun run validate`
Expected: all pass; `✓ Content validation passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/content/benchmarks/decode-speed-gsm8k-200.md apps/cli/src/eval/speed.ts apps/cli/src/eval/suites.ts apps/cli/src/eval/run.ts apps/cli/test/speed.test.mjs apps/cli/test/run-eval.test.mjs
git commit -m "Publish decode speed as a measured benchmark result from the same run"
```

---

### Task 3: Pages — per-device rows and the matrix

**Files:**
- Modify: `apps/web/src/lib/evals.ts`, `apps/web/src/pages/evals/index.astro`, `apps/web/src/pages/evals/[benchmark].astro`, `apps/web/src/pages/registry/models/[...id].astro`, `apps/web/src/pages/data/evals.json.ts`, `apps/web/test/evals-pages.test.mjs`, `apps/web/test/deployment.test.mjs`
- Create: two fixtures in `apps/web/test/fixtures/evals/`

- [ ] **Step 1: Fixtures and failing assertions**

Add two fixture results for benchmark `decode-speed-gsm8k-200` (version `"1"`), model `darsy-xray-analysis`, following the directory's filename rule: one on device `Fixture Laptop` (`apple-silicon`, 32 GB) with `score: 61.5` and `perf: { tokens_per_second: 61.5, time_to_first_token_ms: 480 }`, one on device `Fixture Tower` (`nvidia`, 24 GB) with `score: 140.25` and `perf: { tokens_per_second: 140.25, time_to_first_token_ms: 95 }`. Distinct `evidence.sha256` values (64 × `6`, 64 × `7`), submitter `fixture-bot`, `n: 200`.

In `apps/web/test/evals-pages.test.mjs` assert, on the fixture build:
- `/evals` has an "Efficiency" section with the benchmark's name; `Fixture Tower` appears before `Fixture Laptop` in it (higher is better), each with its `tok/s` score (`140.25`, `61.5`);
- the quality leaderboard rows do **not** show a device name;
- the model page's "Runs locally on" table has a "First token" column and shows `95 ms` for the tower and `480 ms` for the laptop;
- `/data/evals.json` groups for the speed benchmark carry `device` and `memory_gb`, and groups for `gsm8k-200` carry `device: null`.

Add `Fixture Tower` to the leak pattern in `apps/web/test/deployment.test.mjs`.

Run: `bun test apps/web/test/evals-pages.test.mjs`
Expected: the new assertions fail.

- [ ] **Step 2: Implement**

- `loadEvals` calls `groupEvals(runs, { byHardware })` where `byHardware` is the set of ids of benchmarks whose `scoring` is `measured`.
- Leaderboard tables (`/evals`, benchmark page) and the model page's evaluations table: in the Setup cell, when `group.device` is not null, show the device and `memory_gb` on their own `<small>` line.
- The "Speed" column on leaderboards is omitted for measured benchmarks (the score *is* the speed).
- Model page "Runs locally on": add a "First token" column printing `${formatNumber(ms)} ms` or `—`.
- The feed needs no change beyond what `groupEvals` now returns.

- [ ] **Step 3: Run and confirm pass; full verification**

Run: `bun test 2>&1 | tail -4 && bun run check 2>&1 | grep -A3 Result && node scripts/agent/verify.mjs`
Expected: `0 fail`; `0 errors`; gate passes. After a normal build, `grep -rlE "fixture-bot|Fixture (Laptop|Tower)|Q4_K_M|ghost-model" apps/web/dist | wc -l` prints `0`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src apps/web/test
git commit -m "Show measured benchmarks per device and time to first token in the local-run matrix"
```

---

### Task 4: Speed result for the run already published (controller only)

Only if milestone M2 committed a real GSM8K-200 result whose `perf.tokens_per_second` is set.

- [ ] **Step 1: Derive, do not re-run**

The speed result is fully determined by the published quality result, so the model is not run again:

```bash
bun -e '
import { readFileSync, writeFileSync } from "node:fs";
import { speedResultFrom } from "./apps/cli/src/eval/speed.ts";
const path = process.argv[1];
const main = JSON.parse(readFileSync(path, "utf8"));
const speed = speedResultFrom(main, { id: "decode-speed-gsm8k-200", version: "1" });
if (!speed) throw new Error("the published run did not measure speed");
const out = path.replace(`--${main.benchmark}--`, "--decode-speed-gsm8k-200--");
writeFileSync(out, JSON.stringify(speed, null, 2) + "\n");
console.log(out);
' apps/web/src/content/evals/<the published gsm8k-200 result file>
```

- [ ] **Step 2: Verify and commit**

Run: `bun run validate && bun run build >/dev/null 2>&1 && grep -c "Decode speed on GSM8K-200" apps/web/dist/evals/index.html`
Expected: validation passes; at least `1`.

```bash
git add apps/web/src/content/evals/
git commit -m "Add the decode-speed result from the first GSM8K-200 run"
```

---

## Self-review

**Design coverage (long-horizon plan, M4).** Matrix rows per distinct setup with best speed and time to first token, derived from existing results → Task 1 (`localSetups`), Task 3. Efficiency board with a measured throughput benchmark emitted from the same run → Task 2; ranked per device → Tasks 1 and 3. Energy only when measured, no estimates → not emitted anywhere; stated on the benchmark page. The benchmark is named `decode-speed-gsm8k-200` rather than the working name `throughput-v1`, because the number depends on the workload it was measured on.

**Placeholder scan.** Task 4's file name is the file M2 committed; the step says how it is found. Task 2 Step 1 and Task 3 describe assertions against helpers whose names changed during M2's review; each lists the exact content to assert.

**Type consistency.** `GroupOptions.byHardware`, `EvalGroup.device`/`memory_gb`, `LocalSetup.time_to_first_token_ms` (Task 1) are the names used in Task 3. `speedResultFrom(main, { id, version })` and `Suite.speedBenchmark` (Task 2) are the names used in Tasks 2 and 4. `EvalOutcome.speedResultPath` is defined and asserted in Task 2.
