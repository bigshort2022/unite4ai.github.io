# Evaluation Data Model and Leaderboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evaluation results become validated data in git, rendered as static leaderboards, benchmark pages, a model-page section and a public JSON feed (milestones M0 and M1 of `2026-11-14-eval-hub-long-horizon.md`).

**Architecture:** Two content collections (`benchmarks` markdown, `evals` JSON). Zod schemas in `@unite4ai/schema` drive the CI validator; pure aggregation functions in `@unite4ai/core` group runs and rank them; Astro pages render the groups at build time. No server, no committed generated files.

**Tech Stack:** Bun 1.4 workspace, Astro 7.2, Zod 4, `node:test` API run by `bun test`.

**Spec:** `docs/superpowers/specs/2026-11-14-evaluation-first-hub-design.md`

## Global constraints

- Spec cost rules apply: static only; a result file is ≤ 16 KB; deterministic scoring kinds only; no fabricated results (tests use fixtures; **no file is added to `apps/web/src/content/evals/` in this plan**).
- Repo convention: Astro content schemas are defined in `apps/web/src/content.config.ts` with Astro's `z`, and **mirrored** in `packages/schema/src/index.ts` for non-Astro code. Keep the two in step.
- Tests: `*.test.mjs` using `node:test` + `node:assert/strict`, run with `bun test`. Subprocess tests pass `{ timeout: 120_000 }`.
- Internal links use `const base = import.meta.env.BASE_URL.replace(/\/$/, ''); const href = (p: string) => \`${base}${p}\` || '/';`.
- Commits are small and frequent; never amend or force-push. Root `AGENTS.md` must stay under 3072 bytes.

## File map

| Path | Responsibility |
|---|---|
| `sites/sustainability/**` | Task 0: renamed from `sites/ai-sustainability/` |
| `packages/schema/src/index.ts` | `benchmarkSchema`, `evalResultSchema`, enums, `EVAL_RESULT_MAX_BYTES` |
| `packages/core/src/evals.ts` | Pure aggregation: `median`, `groupEvals`, `leaderboard`, `reproductionLabel`, `localSetups` |
| `packages/core/src/validate-evals.ts` | Benchmark and result validation with cross-references |
| `packages/core/src/validate.ts` | Calls `validateEvals` |
| `packages/core/src/index.ts` | Re-exports the aggregation API |
| `packages/core/test/fixtures/evals.mjs` | Fixture factories |
| `packages/core/test/{eval-schema,evals,validate-evals}.test.mjs` | Unit tests |
| `apps/web/src/content.config.ts` | `benchmarks` and `evals` collections |
| `apps/web/src/content/benchmarks/gsm8k-200.md` | First benchmark definition |
| `apps/web/src/content/evals/.gitkeep` | Keeps the empty directory |
| `apps/web/src/lib/evals.ts` | Loads collections, formatting helpers |
| `apps/web/src/pages/evals/index.astro` | Leaderboards |
| `apps/web/src/pages/evals/[benchmark].astro` | Benchmark detail and runs |
| `apps/web/src/pages/data/evals.json.ts` | Public feed |
| `apps/web/src/pages/registry/models/[...id].astro` | Evaluations section |
| `apps/web/src/layouts/Base.astro`, `src/pages/index.astro`, `src/styles/global.css` | Nav link, stat, table styles |
| `apps/web/test/fixtures/evals/*.json`, `apps/web/test/evals-pages.test.mjs` | Fixture build test |
| `apps/web/test/deployment.test.mjs` | Routes, feed, size guard |
| `README.md`, `CONTRIBUTING.md`, `AGENTS.md` | Docs |

---

### Task 0: Rename the sustainability site directory (milestone M0, own branch and PR)

Directory rename only. The package name, brand text, host, gate flag (`--only sustain`), step names and template name (`sustain-loop`) are unchanged.

**Files:**
- Move: `sites/ai-sustainability/` → `sites/sustainability/`
- Modify: `scripts/agent/verify.mjs:23`, `scripts/agent/setup.sh:18`, `scripts/agent/agent-scripts.test.mjs:396`, `docs/agents/requests/sustain-loop.json:7`, `AGENTS.md:9`, `README.md:46`, `docs/agents/local-llm.md` (6 occurrences), `sites/sustainability/README.md` (2 occurrences)

- [ ] **Step 1: Branch and move**

```bash
git checkout -b rename-sustainability-site main
git mv sites/ai-sustainability sites/sustainability
ls sites
```

Expected: `sustainability` only. `git mv` renames the directory on disk, so the untracked `node_modules/`, `dist/` and `.astro/` move with it. If `sites/ai-sustainability` still exists, it contains only untracked leftovers: delete it with `rm -rf sites/ai-sustainability`.

- [ ] **Step 2: Update the path everywhere it is used**

Replace the literal `sites/ai-sustainability` with `sites/sustainability` in exactly these files:

- `scripts/agent/verify.mjs` line 23: `const SUSTAIN = join(ROOT, 'sites/sustainability');`
- `scripts/agent/setup.sh` line 18: `( cd sites/sustainability && npm ci )`
- `scripts/agent/agent-scripts.test.mjs` line 396: `assert.deepEqual(sustain.context_files, ['AGENTS.md', 'sites/sustainability/AGENTS.md']);`
- `docs/agents/requests/sustain-loop.json` line 7: `"context_files": ["AGENTS.md", "sites/sustainability/AGENTS.md"],`
- `AGENTS.md` line 9: `` - `sites/sustainability/` separate npm/Astro site (Sustainable Places). Not in the Bun workspace; see its own AGENTS.md. ``
- `README.md` line 46: ``The Sustainable Places app lives in [`sites/sustainability/`](sites/sustainability/README.md), a standalone npm/Astro project staged for its own repo and `sustainability.unite4ai.com`; it is not part of the Bun workspace.``
- `docs/agents/local-llm.md`: every occurrence (lines 3, 11, 52 twice, 62, 102).
- `sites/sustainability/README.md`: the `cp -r /path/to/unite4ai.github.io/sites/ai-sustainability/. .` line becomes `cp -r /path/to/unite4ai.github.io/sites/sustainability/. .`. Leave the suggested repository name `bigshort2022/ai-sustainability` and the commit message as they are.

Do not edit anything under `docs/superpowers/` (dated records) or `package.json` / `package-lock.json` names.

- [ ] **Step 3: Confirm nothing else points at the old path**

Run: `grep -rn "sites/ai-sustainability" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.astro --exclude-dir=.agent | grep -v "^./docs/superpowers/"`
Expected: no output.

- [ ] **Step 4: Verify**

Run: `bun test scripts/agent && node scripts/agent/verify.mjs`
Expected: `25 pass, 0 fail`; six `ok` lines and `{"status":"pass",…}`.

Run: `wc -c AGENTS.md`
Expected: under 3072.

- [ ] **Step 5: Commit, push, open the PR**

```bash
git add -A
git commit -m "Rename sites/ai-sustainability to sites/sustainability"
git push -u origin rename-sustainability-site
```

PR title: `Rename sites/ai-sustainability to sites/sustainability`. Body: directory rename only; tooling paths updated; package name, host, gate flag and template name unchanged; gate and 25 agent tests pass. Base `main`. Wait for CI `validate` to pass. Do not merge.

- [ ] **Step 6: Start the M1 branch on top of it**

```bash
git checkout eval-first-hub
git merge --no-ff rename-sustainability-site -m "Merge rename-sustainability-site into eval-first-hub"
```

---

### Task 1: Schemas

**Files:**
- Modify: `packages/schema/src/index.ts` (append)
- Create: `packages/core/test/fixtures/evals.mjs`, `packages/core/test/eval-schema.test.mjs`

- [ ] **Step 1: Write the fixture factories**

`packages/core/test/fixtures/evals.mjs`:

```js
export const SHA = 'a'.repeat(64);

export function benchmark(overrides = {}) {
  return {
    name: 'Fixture benchmark',
    summary: 'A benchmark used only in tests.',
    category: 'quality',
    version: '1',
    metric: { name: 'accuracy', unit: '%', higher_is_better: true, min: 0, max: 100 },
    scoring: 'exact-match',
    items: 200,
    source_url: 'https://example.org/items.jsonl',
    license: 'mit',
    updated: '2026-11-14',
    ...overrides,
  };
}

export function result(overrides = {}) {
  return {
    schema_version: 1,
    model: 'model-a',
    benchmark: 'bench-a',
    benchmark_version: '1',
    score: 71.5,
    n: 200,
    run: {
      date: '2026-11-10',
      submitter: 'alice',
      harness: { name: 'unite4ai-eval', version: '0.1.0' },
      command: 'bun run eval -- --benchmark bench-a --model model-a',
    },
    setup: {
      runtime: 'mlx-lm',
      runtime_version: '0.32.4',
      format: 'mlx',
      quantization: '4bit',
      hardware: { device: 'MacBook Pro (M2 Max)', accelerator: 'apple-silicon', memory_gb: 32 },
    },
    evidence: { sha256: SHA },
    ...overrides,
  };
}

/** A run as the aggregation functions receive it: the result plus its collection id. */
export function run(id, overrides = {}) {
  return { id, ...result(overrides) };
}
```

- [ ] **Step 2: Write the failing schema tests**

`packages/core/test/eval-schema.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { benchmarkSchema, evalResultSchema } from '@unite4ai/schema';
import { benchmark, result } from './fixtures/evals.mjs';

const ok = (schema, value) => schema.safeParse(value).success;

test('a complete benchmark and a complete result are accepted', () => {
  assert.equal(ok(benchmarkSchema, benchmark()), true);
  assert.equal(ok(evalResultSchema, result()), true);
  assert.equal(ok(evalResultSchema, result({ perf: { tokens_per_second: 88.2, time_to_first_token_ms: 410 } })), true);
});

test('only deterministic scoring kinds are allowed, so a hosted judge cannot become a per-run bill', () => {
  for (const scoring of ['exact-match', 'multiple-choice', 'canary', 'measured']) {
    assert.equal(ok(benchmarkSchema, benchmark({ scoring })), true, scoring);
  }
  assert.equal(ok(benchmarkSchema, benchmark({ scoring: 'llm-judge' })), false);
});

test('benchmarks need an https source and an open licence', () => {
  assert.equal(ok(benchmarkSchema, benchmark({ source_url: 'http://example.org/items.jsonl' })), false);
  assert.equal(ok(benchmarkSchema, benchmark({ license: 'cc-by-nc-4.0' })), false);
  assert.equal(ok(benchmarkSchema, benchmark({ source_sha256: 'abc' })), false);
});

test('results are rejected when a required part is malformed', () => {
  const bad = [
    result({ schema_version: 2 }),
    result({ n: 0 }),
    result({ evidence: { sha256: 'abc' } }),
    result({ evidence: { sha256: 'a'.repeat(64), url: 'http://example.org/raw.jsonl' } }),
    result({ run: { ...result().run, date: '2026-1-5' } }),
    result({ run: { ...result().run, submitter: 'not a handle' } }),
    result({ setup: { ...result().setup, runtime: 'made-up-runtime' } }),
    result({ setup: { ...result().setup, hardware: { ...result().setup.hardware, memory_gb: 0 } } }),
    result({ perf: { tokens_per_second: -1 } }),
  ];
  bad.forEach((value, index) => assert.equal(ok(evalResultSchema, value), false, `case ${index}`));
  const { evidence: _dropped, ...withoutEvidence } = result();
  assert.equal(ok(evalResultSchema, withoutEvidence), false);
});
```

- [ ] **Step 3: Run and confirm failure**

Run: `bun test packages/core/test/eval-schema.test.mjs`
Expected: FAIL: `benchmarkSchema` / `evalResultSchema` are not exported (`undefined.safeParse`).

- [ ] **Step 4: Implement the schemas**

Append to `packages/schema/src/index.ts`:

```ts
// ─── Evaluations ─────────────────────────────────────────────────────────────

const httpsUrl = z.string().url().refine((value) => value.startsWith('https://'), { message: 'must be an https URL' });
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/, 'must be a 64-character lowercase hex sha256');

export const EVAL_CATEGORIES = ['quality', 'security', 'efficiency'] as const;
/** Deterministic scoring only: a hosted LLM judge would be a per-run API bill. */
export const EVAL_SCORING = ['exact-match', 'multiple-choice', 'canary', 'measured'] as const;
export const EVAL_RUNTIMES = ['mlx-lm', 'ollama', 'llama.cpp', 'vllm', 'transformers', 'other'] as const;
export const EVAL_FORMATS = ['mlx', 'gguf', 'safetensors', 'other'] as const;
export const EVAL_ACCELERATORS = ['apple-silicon', 'nvidia', 'amd', 'cpu', 'other'] as const;
/** Result files above this size are rejected: raw output is referenced by hash, never stored in git. */
export const EVAL_RESULT_MAX_BYTES = 16 * 1024;

export const benchmarkSchema = z.object({
  name: z.string().min(1),
  summary: z.string().max(300),
  category: z.enum(EVAL_CATEGORIES),
  version: z.string().min(1),
  metric: z.object({
    name: z.string().min(1),
    unit: z.string(),
    higher_is_better: z.boolean(),
    min: z.number().optional(),
    max: z.number().optional(),
  }),
  scoring: z.enum(EVAL_SCORING),
  items: z.number().int().nonnegative(),
  source_url: httpsUrl,
  source_sha256: sha256Hex.optional(),
  license: openLicenseEnum,
  updated: z.coerce.date(),
});
export type BenchmarkData = z.infer<typeof benchmarkSchema>;

export const evalResultSchema = z.object({
  schema_version: z.literal(1),
  model: z.string().min(1),
  benchmark: z.string().min(1),
  benchmark_version: z.string().min(1),
  score: z.number(),
  n: z.number().int().positive(),
  run: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD'),
    submitter: z.string().regex(/^[A-Za-z0-9-]+$/, 'must be a GitHub handle'),
    harness: z.object({ name: z.string().min(1), version: z.string().min(1) }),
    command: z.string().min(1),
  }),
  setup: z.object({
    runtime: z.enum(EVAL_RUNTIMES),
    runtime_version: z.string().min(1),
    format: z.enum(EVAL_FORMATS),
    quantization: z.string().min(1),
    hardware: z.object({
      device: z.string().min(1),
      accelerator: z.enum(EVAL_ACCELERATORS),
      memory_gb: z.number().positive(),
    }),
  }),
  perf: z.object({
    tokens_per_second: z.number().positive().optional(),
    time_to_first_token_ms: z.number().positive().optional(),
    peak_memory_gb: z.number().positive().optional(),
    energy_wh_per_1k_tokens: z.number().positive().optional(),
  }).optional(),
  evidence: z.object({
    sha256: sha256Hex,
    url: httpsUrl.optional(),
    bytes: z.number().int().positive().optional(),
  }),
});
export type EvalResult = z.infer<typeof evalResultSchema>;
```

- [ ] **Step 5: Run and confirm pass**

Run: `bun test packages/core/test/eval-schema.test.mjs`
Expected: `4 pass, 0 fail`.

- [ ] **Step 6: Commit**

```bash
git add packages/schema/src/index.ts packages/core/test/fixtures/evals.mjs packages/core/test/eval-schema.test.mjs
git commit -m "Add benchmark and evaluation result schemas"
```

---

### Task 2: Aggregation

**Files:**
- Create: `packages/core/src/evals.ts`, `packages/core/test/evals.test.mjs`
- Modify: `packages/core/src/index.ts`

**Interface (used by Tasks 5 and 6):**

```ts
interface EvalRun { id: string; model: string; benchmark: string; benchmark_version: string; score: number; n: number; run: {…}; setup: {…}; perf?: {…}; evidence: {…} }
interface EvalGroup { key; model; benchmark; benchmark_version; format; quantization; score; score_min; score_max; runs; n; submitters: string[]; runtimes: string[]; accelerators: string[]; tokens_per_second: number | null; latest: string; run_ids: string[] }
interface BenchmarkRef { id: string; version: string; higher_is_better: boolean }
interface LocalSetup { runtime; format; quantization; accelerator; device; memory_gb; tokens_per_second: number | null }
median(values: number[]): number
groupEvals(runs: EvalRun[]): EvalGroup[]
leaderboard(groups: EvalGroup[], benchmark: BenchmarkRef): EvalGroup[]
reproductionLabel(group: EvalGroup): string
localSetups(runs: EvalRun[]): LocalSetup[]
```

- [ ] **Step 1: Write the failing tests**

`packages/core/test/evals.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { groupEvals, leaderboard, localSetups, median, reproductionLabel } from '../src/evals.ts';
import { result, run } from './fixtures/evals.mjs';

const setup = (overrides = {}) => ({ ...result().setup, ...overrides });
const by = (submitter, date) => ({ ...result().run, submitter, date });

test('median handles odd and even counts without mutating its input', () => {
  const values = [9, 1, 5];
  assert.equal(median(values), 5);
  assert.deepEqual(values, [9, 1, 5]);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([7]), 7);
});

test('runs are grouped by model, benchmark, version, format and quantization, not by runtime', () => {
  const groups = groupEvals([
    run('a', { score: 60 }),
    run('b', { score: 64, setup: setup({ runtime: 'transformers' }) }),
    run('c', { score: 70, setup: setup({ format: 'gguf', quantization: 'Q4_K_M', runtime: 'llama.cpp' }) }),
    run('d', { score: 50, benchmark_version: '0' }),
    run('e', { score: 55, model: 'model-b' }),
  ]);
  assert.equal(groups.length, 4);
  const mlx = groups.find((g) => g.model === 'model-a' && g.format === 'mlx' && g.benchmark_version === '1');
  assert.deepEqual(mlx.run_ids, ['a', 'b']);
  assert.deepEqual(mlx.runtimes, ['mlx-lm', 'transformers']);
});

test('a group reports median, range, run count, distinct submitters, latest date and median speed', () => {
  const [group] = groupEvals([
    run('a', { score: 60, run: by('alice', '2026-11-01'), perf: { tokens_per_second: 40 } }),
    run('b', { score: 70, run: by('bob', '2026-11-05'), perf: { tokens_per_second: 60 } }),
    run('c', { score: 62, run: by('alice', '2026-11-03') }),
  ]);
  assert.equal(group.score, 62);
  assert.equal(group.score_min, 60);
  assert.equal(group.score_max, 70);
  assert.equal(group.runs, 3);
  assert.equal(group.n, 200);
  assert.deepEqual(group.submitters, ['alice', 'bob']);
  assert.equal(group.latest, '2026-11-05');
  assert.equal(group.tokens_per_second, 50);
  assert.deepEqual(group.accelerators, ['apple-silicon']);
});

test('speed is null when no run measured it', () => {
  assert.equal(groupEvals([run('a')])[0].tokens_per_second, null);
});

test('reproduction label counts submitters other than the first', () => {
  const single = groupEvals([run('a'), run('b')])[0];
  assert.equal(reproductionLabel(single), 'single run');
  const reproduced = groupEvals([run('a'), run('b', { run: by('bob', '2026-11-11') }), run('c', { run: by('carol', '2026-11-12') })])[0];
  assert.equal(reproductionLabel(reproduced), 'reproduced by 2');
});

test('leaderboard keeps only the current version and ranks by the metric direction', () => {
  const groups = groupEvals([
    run('low', { model: 'm-low', score: 40 }),
    run('high', { model: 'm-high', score: 90 }),
    run('old', { model: 'm-old', score: 99, benchmark_version: '0' }),
    run('other', { model: 'm-other', score: 95, benchmark: 'bench-b' }),
  ]);
  const up = leaderboard(groups, { id: 'bench-a', version: '1', higher_is_better: true });
  assert.deepEqual(up.map((g) => g.model), ['m-high', 'm-low']);
  const down = leaderboard(groups, { id: 'bench-a', version: '1', higher_is_better: false });
  assert.deepEqual(down.map((g) => g.model), ['m-low', 'm-high']);
});

test('equal scores rank the more widely reproduced group first, then by model id', () => {
  const groups = groupEvals([
    run('z1', { model: 'zeta', score: 80 }),
    run('a1', { model: 'alpha', score: 80 }),
    run('r1', { model: 'repro', score: 80 }),
    run('r2', { model: 'repro', score: 80, run: by('bob', '2026-11-11') }),
  ]);
  const ranked = leaderboard(groups, { id: 'bench-a', version: '1', higher_is_better: true });
  assert.deepEqual(ranked.map((g) => g.model), ['repro', 'alpha', 'zeta']);
});

test('localSetups lists each distinct setup once with its best measured speed', () => {
  const setups = localSetups([
    run('a', { perf: { tokens_per_second: 40 } }),
    run('b', { perf: { tokens_per_second: 55 } }),
    run('c', { setup: setup({ format: 'gguf', quantization: 'Q4_K_M', runtime: 'llama.cpp' }) }),
  ]);
  assert.equal(setups.length, 2);
  const mlx = setups.find((s) => s.format === 'mlx');
  assert.equal(mlx.tokens_per_second, 55);
  assert.equal(mlx.device, 'MacBook Pro (M2 Max)');
  assert.equal(setups.find((s) => s.format === 'gguf').tokens_per_second, null);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test packages/core/test/evals.test.mjs`
Expected: FAIL: cannot find module `../src/evals.ts`.

- [ ] **Step 3: Implement `packages/core/src/evals.ts`**

```ts
/**
 * Aggregation of evaluation runs. Pure functions over plain data, so pages, the feed and
 * tests share one definition of "a group" and "a ranking".
 */

export interface EvalRun {
  id: string;
  model: string;
  benchmark: string;
  benchmark_version: string;
  score: number;
  n: number;
  run: { date: string; submitter: string; harness: { name: string; version: string }; command: string };
  setup: {
    runtime: string;
    runtime_version: string;
    format: string;
    quantization: string;
    hardware: { device: string; accelerator: string; memory_gb: number };
  };
  perf?: {
    tokens_per_second?: number;
    time_to_first_token_ms?: number;
    peak_memory_gb?: number;
    energy_wh_per_1k_tokens?: number;
  };
  evidence: { sha256: string; url?: string; bytes?: number };
}

/** Runs of one model on one benchmark version in one format and quantization. */
export interface EvalGroup {
  key: string;
  model: string;
  benchmark: string;
  benchmark_version: string;
  format: string;
  quantization: string;
  /** Median score of the group's runs. */
  score: number;
  score_min: number;
  score_max: number;
  runs: number;
  /** Largest item count among the runs. */
  n: number;
  submitters: string[];
  runtimes: string[];
  accelerators: string[];
  /** Median of the runs that measured it; null when none did. */
  tokens_per_second: number | null;
  latest: string;
  run_ids: string[];
}

export interface BenchmarkRef {
  id: string;
  version: string;
  higher_is_better: boolean;
}

export interface LocalSetup {
  runtime: string;
  format: string;
  quantization: string;
  accelerator: string;
  device: string;
  memory_gb: number;
  tokens_per_second: number | null;
}

const unique = (values: string[]) => [...new Set(values)].sort();

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function groupEvals(runs: EvalRun[]): EvalGroup[] {
  const buckets = new Map<string, EvalRun[]>();
  for (const run of runs) {
    const key = [run.model, run.benchmark, run.benchmark_version, run.setup.format, run.setup.quantization].join('|');
    const bucket = buckets.get(key);
    if (bucket) bucket.push(run);
    else buckets.set(key, [run]);
  }

  return [...buckets.entries()]
    .map(([key, members]) => {
      const [first] = members;
      const scores = members.map((m) => m.score);
      const speeds = members
        .map((m) => m.perf?.tokens_per_second)
        .filter((value): value is number => typeof value === 'number');
      return {
        key,
        model: first.model,
        benchmark: first.benchmark,
        benchmark_version: first.benchmark_version,
        format: first.setup.format,
        quantization: first.setup.quantization,
        score: median(scores),
        score_min: Math.min(...scores),
        score_max: Math.max(...scores),
        runs: members.length,
        n: Math.max(...members.map((m) => m.n)),
        submitters: unique(members.map((m) => m.run.submitter)),
        runtimes: unique(members.map((m) => m.setup.runtime)),
        accelerators: unique(members.map((m) => m.setup.hardware.accelerator)),
        tokens_per_second: speeds.length ? median(speeds) : null,
        latest: members.map((m) => m.run.date).sort().at(-1) as string,
        run_ids: members.map((m) => m.id).sort(),
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** Groups for the benchmark's current version, best first; ties go to the more reproduced group. */
export function leaderboard(groups: EvalGroup[], benchmark: BenchmarkRef): EvalGroup[] {
  const direction = benchmark.higher_is_better ? -1 : 1;
  return groups
    .filter((g) => g.benchmark === benchmark.id && g.benchmark_version === benchmark.version)
    .sort((a, b) =>
      direction * (a.score - b.score)
      || b.submitters.length - a.submitters.length
      || a.model.localeCompare(b.model));
}

/** Results are self-reported; independent submitters are the trust signal. */
export function reproductionLabel(group: EvalGroup): string {
  const others = group.submitters.length - 1;
  return others > 0 ? `reproduced by ${others}` : 'single run';
}

/** Distinct setups a model has been run on, each with its best measured speed. */
export function localSetups(runs: EvalRun[]): LocalSetup[] {
  const setups = new Map<string, LocalSetup>();
  for (const run of runs) {
    const { runtime, format, quantization, hardware } = run.setup;
    const key = [runtime, format, quantization, hardware.accelerator, hardware.device, hardware.memory_gb].join('|');
    const speed = run.perf?.tokens_per_second ?? null;
    const existing = setups.get(key);
    if (!existing) {
      setups.set(key, {
        runtime,
        format,
        quantization,
        accelerator: hardware.accelerator,
        device: hardware.device,
        memory_gb: hardware.memory_gb,
        tokens_per_second: speed,
      });
    } else if (speed !== null && (existing.tokens_per_second === null || speed > existing.tokens_per_second)) {
      existing.tokens_per_second = speed;
    }
  }
  return [...setups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value);
}
```

- [ ] **Step 4: Export from the package**

Append to `packages/core/src/index.ts`:

```ts
export {
  groupEvals,
  leaderboard,
  localSetups,
  median,
  reproductionLabel,
  type BenchmarkRef,
  type EvalGroup,
  type EvalRun,
  type LocalSetup,
} from './evals.ts';
```

- [ ] **Step 5: Run and confirm pass**

Run: `bun test packages/core/test/evals.test.mjs`
Expected: `8 pass, 0 fail`.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/evals.ts packages/core/src/index.ts packages/core/test/evals.test.mjs
git commit -m "Add evaluation run grouping and ranking"
```

---

### Task 3: Validator

**Files:**
- Create: `packages/core/src/validate-evals.ts`, `packages/core/test/validate-evals.test.mjs`
- Modify: `packages/core/src/validate.ts` (import and one call before `return { errors, warnings };`)

**Interface:** `validateEvals(contentRoot: string, errors: string[], today?: string): Promise<void>`; pushes one message per problem, each starting with the file's path relative to the content root (`benchmarks/<file>` or `evals/<file>`). `today` is `YYYY-MM-DD`, defaulting to the current UTC date (injectable for tests).

Benchmark frontmatter is parsed with `Bun.YAML.parse` (built into Bun ≥ 1.2.21; the validator and its tests already run only under Bun).

- [ ] **Step 1: Write the failing tests**

`packages/core/test/validate-evals.test.mjs`:

```js
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { validateContent } from '../src/validate.ts';
import { benchmark, result } from './fixtures/evals.mjs';

const MODEL_CARD = `---
name: Model A
summary: Fixture model used only in tests.
maintainers: ["tester"]
license: mit
openness:
  weights: open
  training_data: open
  training_code: open
  evaluation: open
updated: 2026-11-01
---

## Notes

Fixture.
`;

const FILE = 'model-a--bench-a--alice--2026-11-10.json';
const roots = [];
after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

/** YAML is a superset of JSON, so fixtures write frontmatter as JSON. */
function makeRoot({ benchmarks = { 'bench-a': benchmark() }, evals = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'u4ai-content-'));
  roots.push(root);
  for (const dir of ['models', 'benchmarks', 'evals']) mkdirSync(join(root, dir));
  writeFileSync(join(root, 'models/model-a.md'), MODEL_CARD);
  for (const [id, data] of Object.entries(benchmarks)) {
    writeFileSync(join(root, 'benchmarks', `${id}.md`), `---\n${JSON.stringify(data, null, 2)}\n---\n\n## Method\n\nFixture.\n`);
  }
  for (const [file, data] of Object.entries(evals)) {
    writeFileSync(join(root, 'evals', file), typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  }
  return root;
}

async function errorsFor(options) {
  return (await validateContent(makeRoot(options))).errors;
}

test('a valid benchmark and a valid result produce no errors', async () => {
  assert.deepEqual(await errorsFor({ evals: { [FILE]: result() } }), []);
});

test('content with no evals or benchmarks directories is still valid', async () => {
  const root = mkdtempSync(join(tmpdir(), 'u4ai-content-'));
  roots.push(root);
  assert.deepEqual((await validateContent(root)).errors, []);
});

test('a result over 16 KB is rejected and told where raw output belongs', async () => {
  const big = result({ run: { ...result().run, command: 'x'.repeat(17_000) } });
  const errors = await errorsFor({ evals: { [FILE]: big } });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^evals\/model-a--bench-a--alice--2026-11-10\.json: \d+ bytes exceeds the 16384-byte limit/);
  assert.match(errors[0], /evidence\.url/);
});

test('a result must reference an existing model card and benchmark', async () => {
  const ghostModel = await errorsFor({ evals: { 'ghost--bench-a--alice--2026-11-10.json': result({ model: 'ghost' }) } });
  assert.match(ghostModel.join('\n'), /model "ghost" has no card in models\//);
  const ghostBench = await errorsFor({ evals: { 'model-a--ghost--alice--2026-11-10.json': result({ benchmark: 'ghost' }) } });
  assert.match(ghostBench.join('\n'), /benchmark "ghost" is not defined/);
});

test('score and item count must fit the benchmark', async () => {
  const high = await errorsFor({ evals: { [FILE]: result({ score: 140 }) } });
  assert.match(high.join('\n'), /score 140 is above the benchmark maximum 100/);
  const low = await errorsFor({ evals: { [FILE]: result({ score: -3 }) } });
  assert.match(low.join('\n'), /score -3 is below the benchmark minimum 0/);
  const tooMany = await errorsFor({ evals: { [FILE]: result({ n: 201 }) } });
  assert.match(tooMany.join('\n'), /n 201 exceeds the benchmark's 200 items/);
});

test('the filename must state the same model, benchmark, submitter and date as the file', async () => {
  const errors = await errorsFor({ evals: { 'model-a--bench-a--bob--2026-11-10.json': result() } });
  assert.match(errors.join('\n'), /filename must be "model-a--bench-a--alice--2026-11-10\.json"/);
});

test('a run cannot be dated in the future or on a date that does not exist', async () => {
  const future = await errorsFor({ evals: { 'model-a--bench-a--alice--2999-01-01.json': result({ run: { ...result().run, date: '2999-01-01' } }) } });
  assert.match(future.join('\n'), /run\.date 2999-01-01 is in the future/);
  const impossible = await errorsFor({ evals: { 'model-a--bench-a--alice--2026-13-45.json': result({ run: { ...result().run, date: '2026-13-45' } }) } });
  assert.match(impossible.join('\n'), /run\.date 2026-13-45 is not a real date/);
});

test('malformed files are reported by name, with the failing field', async () => {
  const notJson = await errorsFor({ evals: { [FILE]: '{ not json' } });
  assert.match(notJson.join('\n'), /^evals\/model-a--bench-a--alice--2026-11-10\.json: not valid JSON/m);
  const { evidence: _dropped, ...withoutEvidence } = result();
  const missing = await errorsFor({ evals: { [FILE]: withoutEvidence } });
  assert.match(missing.join('\n'), /evals\/model-a--bench-a--alice--2026-11-10\.json: evidence/);
});

test('a benchmark with a non-deterministic scoring kind or a plain-http source is rejected', async () => {
  const judge = await errorsFor({ benchmarks: { 'bench-a': benchmark({ scoring: 'llm-judge' }) } });
  assert.match(judge.join('\n'), /^benchmarks\/bench-a\.md: scoring/m);
  const http = await errorsFor({ benchmarks: { 'bench-a': benchmark({ source_url: 'http://example.org/x' }) } });
  assert.match(http.join('\n'), /^benchmarks\/bench-a\.md: source_url: must be an https URL/m);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test packages/core/test/validate-evals.test.mjs`
Expected: the first two tests pass (nothing validates evals yet, so no errors); the other seven FAIL because the expected errors are missing.

- [ ] **Step 3: Implement `packages/core/src/validate-evals.ts`**

```ts
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  EVAL_RESULT_MAX_BYTES,
  benchmarkSchema,
  evalResultSchema,
  type BenchmarkData,
} from '@unite4ai/schema';

interface SchemaIssue {
  path: PropertyKey[];
  message: string;
}

function describe(issues: SchemaIssue[]): string {
  return issues.map((issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`).join('; ');
}

async function list(dir: string, pattern: RegExp): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((file) => pattern.test(file)).sort();
  } catch {
    return [];
  }
}

function isRealDate(date: string): boolean {
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
}

/**
 * Validates benchmark definitions and evaluation result files, including the rules a schema
 * cannot express: size, cross-references, score bounds and filename/content agreement.
 */
export async function validateEvals(
  contentRoot: string,
  errors: string[],
  today: string = new Date().toISOString().slice(0, 10),
): Promise<void> {
  const modelIds = new Set((await list(join(contentRoot, 'models'), /\.mdx?$/)).map((file) => file.replace(/\.mdx?$/, '')));

  const benchmarks = new Map<string, BenchmarkData>();
  for (const file of await list(join(contentRoot, 'benchmarks'), /\.md$/)) {
    const rel = `benchmarks/${file}`;
    const raw = await readFile(join(contentRoot, 'benchmarks', file), 'utf8');
    const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatter) {
      errors.push(`${rel}: missing YAML frontmatter (the --- block at the top)`);
      continue;
    }
    let data: unknown;
    try {
      data = Bun.YAML.parse(frontmatter[1]);
    } catch (error) {
      errors.push(`${rel}: frontmatter is not valid YAML (${(error as Error).message})`);
      continue;
    }
    const parsed = benchmarkSchema.safeParse(data);
    if (!parsed.success) {
      errors.push(`${rel}: ${describe(parsed.error.issues)}`);
      continue;
    }
    benchmarks.set(file.replace(/\.md$/, ''), parsed.data);
  }

  for (const file of await list(join(contentRoot, 'evals'), /\.json$/)) {
    const rel = `evals/${file}`;
    const path = join(contentRoot, 'evals', file);
    const { size } = await stat(path);
    if (size > EVAL_RESULT_MAX_BYTES) {
      errors.push(
        `${rel}: ${size} bytes exceeds the ${EVAL_RESULT_MAX_BYTES}-byte limit. `
        + 'Keep raw output out of git: host it yourself and reference it with evidence.url and evidence.sha256.',
      );
      continue;
    }
    let json: unknown;
    try {
      json = JSON.parse(await readFile(path, 'utf8'));
    } catch {
      errors.push(`${rel}: not valid JSON`);
      continue;
    }
    const parsed = evalResultSchema.safeParse(json);
    if (!parsed.success) {
      errors.push(`${rel}: ${describe(parsed.error.issues)}`);
      continue;
    }
    const result = parsed.data;

    const expected = `${result.model}--${result.benchmark}--${result.run.submitter}--${result.run.date}.json`;
    if (file !== expected) {
      errors.push(`${rel}: filename must be "${expected}" (model--benchmark--submitter--date)`);
    }
    if (!isRealDate(result.run.date)) {
      errors.push(`${rel}: run.date ${result.run.date} is not a real date`);
    } else if (result.run.date > today) {
      errors.push(`${rel}: run.date ${result.run.date} is in the future`);
    }
    if (!modelIds.has(result.model)) {
      errors.push(`${rel}: model "${result.model}" has no card in models/. Add the model card first.`);
    }
    const benchmark = benchmarks.get(result.benchmark);
    if (!benchmark) {
      errors.push(`${rel}: benchmark "${result.benchmark}" is not defined (or failed validation) in benchmarks/`);
      continue;
    }
    const { min, max } = benchmark.metric;
    if (min !== undefined && result.score < min) {
      errors.push(`${rel}: score ${result.score} is below the benchmark minimum ${min}`);
    }
    if (max !== undefined && result.score > max) {
      errors.push(`${rel}: score ${result.score} is above the benchmark maximum ${max}`);
    }
    if (benchmark.items > 0 && result.n > benchmark.items) {
      errors.push(`${rel}: n ${result.n} exceeds the benchmark's ${benchmark.items} items`);
    }
  }
}
```

- [ ] **Step 4: Call it from `validateContent`**

In `packages/core/src/validate.ts`, add to the imports at the top:

```ts
import { validateEvals } from './validate-evals.ts';
```

and replace the final `return { errors, warnings };` with:

```ts
  await validateEvals(contentRoot, errors);

  return { errors, warnings };
```

- [ ] **Step 5: Run and confirm pass**

Run: `bun test packages/core/test`
Expected: `21 pass, 0 fail` (4 schema + 8 aggregation + 9 validator).

Run: `bun run validate`
Expected: `✓ Content validation passed` (no benchmarks or evals exist yet).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/validate-evals.ts packages/core/src/validate.ts packages/core/test/validate-evals.test.mjs
git commit -m "Validate benchmark definitions and evaluation results in the content gate"
```

---

### Task 4: Content collections and the first benchmark

**Files:**
- Modify: `apps/web/src/content.config.ts`
- Create: `apps/web/src/content/benchmarks/gsm8k-200.md`, `apps/web/src/content/evals/.gitkeep`

The benchmark's facts were verified against its source on 2026-11-14: `LICENSE` in `openai/grade-school-math` is MIT; `grade_school_math/data/test.jsonl` at commit `3101c7d5072418e28b9008a6636bde82a006892c` has 1,319 lines, 749,738 bytes, sha256 `3730d312f6e3440559ace48831e51066acaca737f6eabec99bccb9e4b3c39d14`.

- [ ] **Step 1: Re-verify the pinned source before committing it**

```bash
curl -sL https://raw.githubusercontent.com/openai/grade-school-math/3101c7d5072418e28b9008a6636bde82a006892c/grade_school_math/data/test.jsonl | shasum -a 256
curl -sL https://raw.githubusercontent.com/openai/grade-school-math/3101c7d5072418e28b9008a6636bde82a006892c/LICENSE | head -1
```

Expected: `3730d312f6e3440559ace48831e51066acaca737f6eabec99bccb9e4b3c39d14  -` and `MIT License`. If either differs, stop and report; do not change the values to match.

- [ ] **Step 2: Add the collections**

In `apps/web/src/content.config.ts`, insert before the final `export const collections` line:

```ts
const httpsUrl = z.string().url().refine((value) => value.startsWith('https://'), { message: 'must be an https URL' });
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

/** A benchmark definition. Mirrors benchmarkSchema in @unite4ai/schema. */
const benchmarks = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/benchmarks' }),
  schema: z.object({
    name: z.string().min(1),
    summary: z.string().max(300),
    category: z.enum(['quality', 'security', 'efficiency']),
    version: z.string().min(1),
    metric: z.object({
      name: z.string().min(1),
      unit: z.string(),
      higher_is_better: z.boolean(),
      min: z.number().optional(),
      max: z.number().optional(),
    }),
    scoring: z.enum(['exact-match', 'multiple-choice', 'canary', 'measured']),
    items: z.number().int().nonnegative(),
    source_url: httpsUrl,
    source_sha256: sha256Hex.optional(),
    license: openLicenseEnum,
    updated: z.coerce.date(),
  }),
});

/**
 * One evaluation run per JSON file. Mirrors evalResultSchema in @unite4ai/schema.
 * U4AI_EVALS_DIR lets the page tests build against fixtures; production never sets it.
 */
const evals = defineCollection({
  loader: glob({ pattern: '**/*.json', base: process.env.U4AI_EVALS_DIR ?? './src/content/evals' }),
  schema: z.object({
    schema_version: z.literal(1),
    model: z.string().min(1),
    benchmark: z.string().min(1),
    benchmark_version: z.string().min(1),
    score: z.number(),
    n: z.number().int().positive(),
    run: z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      submitter: z.string().regex(/^[A-Za-z0-9-]+$/),
      harness: z.object({ name: z.string().min(1), version: z.string().min(1) }),
      command: z.string().min(1),
    }),
    setup: z.object({
      runtime: z.enum(['mlx-lm', 'ollama', 'llama.cpp', 'vllm', 'transformers', 'other']),
      runtime_version: z.string().min(1),
      format: z.enum(['mlx', 'gguf', 'safetensors', 'other']),
      quantization: z.string().min(1),
      hardware: z.object({
        device: z.string().min(1),
        accelerator: z.enum(['apple-silicon', 'nvidia', 'amd', 'cpu', 'other']),
        memory_gb: z.number().positive(),
      }),
    }),
    perf: z.object({
      tokens_per_second: z.number().positive().optional(),
      time_to_first_token_ms: z.number().positive().optional(),
      peak_memory_gb: z.number().positive().optional(),
      energy_wh_per_1k_tokens: z.number().positive().optional(),
    }).optional(),
    evidence: z.object({
      sha256: sha256Hex,
      url: httpsUrl.optional(),
      bytes: z.number().int().positive().optional(),
    }),
  }),
});
```

and change the export to:

```ts
export const collections = { models, datasets, compute, courses, events, posts, comments, benchmarks, evals };
```

- [ ] **Step 3: Add the benchmark and keep the empty evals directory**

```bash
mkdir -p apps/web/src/content/benchmarks apps/web/src/content/evals
touch apps/web/src/content/evals/.gitkeep
```

`apps/web/src/content/benchmarks/gsm8k-200.md`:

```markdown
---
name: GSM8K (first 200)
summary: Grade-school maths word problems scored by exact match on the final number. Uses the first 200 items of the official test split so a laptop finishes a run in minutes.
category: quality
version: "1"
metric:
  name: accuracy
  unit: "%"
  higher_is_better: true
  min: 0
  max: 100
scoring: exact-match
items: 200
source_url: https://raw.githubusercontent.com/openai/grade-school-math/3101c7d5072418e28b9008a6636bde82a006892c/grade_school_math/data/test.jsonl
source_sha256: 3730d312f6e3440559ace48831e51066acaca737f6eabec99bccb9e4b3c39d14
license: mit
updated: 2026-11-14
---

## What it measures

Multi-step arithmetic reasoning on short word problems. GSM8K was published by Cobbe et al.
(2021), "Training Verifiers to Solve Math Word Problems". Its test split has 1,319 problems;
this benchmark uses the **first 200 in file order**.

## Method

1. Fetch the pinned file at `source_url` and check it against `source_sha256`.
2. Take the first 200 lines. Each has a `question` and an `answer` whose last line is `#### <number>`.
3. Ask the model the question at temperature 0.
4. The model's answer is the last number in its reply, with thousands separators removed.
5. An item is correct when that number equals the number after `####`.
6. The score is the percentage of the 200 items answered correctly.

The source file is not copied into this repository. It is fetched from the authors'
repository at a fixed commit and verified by hash.

## Known weaknesses

- **Contamination.** The test split has been public since 2021 and is widely present in
  training data. Treat scores as an upper bound on reasoning ability.
- **Small sample.** With 200 items, the standard error is about 3.5 points near 50% and about
  2 points near 90%. Differences smaller than that are noise.
- **Format sensitivity.** Exact match on the last number penalises a correct answer followed
  by another number, and rewards nothing for correct working with a slip at the end.
- **English only**, and arithmetic only.

## Licence

The dataset is MIT-licensed by its authors (`LICENSE` in `openai/grade-school-math`).
```

- [ ] **Step 4: Validate and build**

Run: `bun run validate`
Expected: `✓ Content validation passed`.

Run: `bun run build 2>&1 | grep -iE "error|warn|Complete"`
Expected: `Complete!` and no error. A warning that the `evals` collection is empty is acceptable; record its exact text in your report. If the build **fails** because the directory has no JSON files, stop and report the message.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/content.config.ts apps/web/src/content/benchmarks/gsm8k-200.md apps/web/src/content/evals/.gitkeep
git commit -m "Add benchmark and evaluation collections with the GSM8K-200 definition"
```

---

### Task 5: Leaderboard and benchmark pages

**Files:**
- Create: `apps/web/src/lib/evals.ts`, `apps/web/src/pages/evals/index.astro`, `apps/web/src/pages/evals/[benchmark].astro`
- Create: `apps/web/test/fixtures/evals/` (3 files), `apps/web/test/evals-pages.test.mjs`
- Modify: `apps/web/src/styles/global.css` (append)

- [ ] **Step 1: Write the fixtures**

These exist only so a test build has rows to render. They pair the registry's one model card with GSM8K purely as a fixture and are never deployed.

`apps/web/test/fixtures/evals/darsy-xray-analysis--gsm8k-200--fixture-bot--2026-11-01.json`:

```json
{
  "schema_version": 1,
  "model": "darsy-xray-analysis",
  "benchmark": "gsm8k-200",
  "benchmark_version": "1",
  "score": 60,
  "n": 200,
  "run": {
    "date": "2026-11-01",
    "submitter": "fixture-bot",
    "harness": { "name": "unite4ai-eval", "version": "0.0.0-fixture" },
    "command": "bun run eval -- --benchmark gsm8k-200 --model darsy-xray-analysis --fixture-one"
  },
  "setup": {
    "runtime": "mlx-lm",
    "runtime_version": "0.0.0",
    "format": "mlx",
    "quantization": "4bit",
    "hardware": { "device": "Fixture Laptop", "accelerator": "apple-silicon", "memory_gb": 32 }
  },
  "perf": { "tokens_per_second": 50 },
  "evidence": { "sha256": "1111111111111111111111111111111111111111111111111111111111111111" }
}
```

`apps/web/test/fixtures/evals/darsy-xray-analysis--gsm8k-200--fixture-bot-2--2026-11-02.json`: the same object with `"score": 64`, `"date": "2026-11-02"`, `"submitter": "fixture-bot-2"`, `"command"` ending `--fixture-two`, `"perf": { "tokens_per_second": 70 }`, and `"sha256"` of sixty-four `2` characters.

`apps/web/test/fixtures/evals/darsy-xray-analysis--gsm8k-200--fixture-bot--2026-11-03.json`: the same object as the first with `"score": 70`, `"date": "2026-11-03"`, `"command"` ending `--fixture-three`, `"runtime": "llama.cpp"`, `"format": "gguf"`, `"quantization": "Q4_K_M"`, no `"perf"` key, and `"sha256"` of sixty-four `3` characters.

- [ ] **Step 2: Write the failing page test**

`apps/web/test/evals-pages.test.mjs`:

```js
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'u4ai-evals-site-'));
after(() => rmSync(out, { recursive: true, force: true }));

const page = (path) => readFileSync(join(out, path), 'utf8');

// Builds the site against fixture results into a temp directory; the real dist is untouched.
test('leaderboard and benchmark page render fixture results', { timeout: 120_000 }, () => {
  const build = spawnSync('bun', ['run', 'astro', 'build', '--outDir', out], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, U4AI_EVALS_DIR: './test/fixtures/evals' },
  });
  assert.equal(build.status, 0, `${build.stdout}${build.stderr}`);

  const board = page('evals/index.html');
  assert.match(board, /GSM8K \(first 200\)/);
  assert.match(board, /href="\/registry\/models\/darsy-xray-analysis"/);
  // Two groups: gguf (70) ranks above mlx (median of 60 and 64 = 62).
  assert.ok(board.indexOf('Q4_K_M') < board.indexOf('4bit'), 'higher score must rank first');
  assert.match(board, />62</);
  assert.match(board, /60–64/);
  assert.match(board, /reproduced by 1/);
  assert.match(board, /single run/);
  assert.match(board, /self-reported/i);

  const detail = page('evals/gsm8k-200/index.html');
  assert.match(detail, /Known weaknesses/);
  assert.match(detail, /fixture-bot-2/);
  assert.match(detail, /--fixture-three/);
  assert.match(detail, /3{12}/);
});
```

- [ ] **Step 3: Run and confirm failure**

Run: `bun test apps/web/test/evals-pages.test.mjs`
Expected: FAIL: `ENOENT … evals/index.html` (the build succeeds, the page does not exist).

- [ ] **Step 4: Loader and helpers**

`apps/web/src/lib/evals.ts`:

```ts
import { getCollection } from 'astro:content';
import { groupEvals, type EvalGroup, type EvalRun } from '@unite4ai/core';

export const REPO = 'https://github.com/bigshort2022/unite4ai.github.io';
export const SUBMIT_GUIDE = `${REPO}/blob/main/CONTRIBUTING.md#submitting-an-evaluation-result`;

export const CATEGORIES = ['quality', 'security', 'efficiency'] as const;
export const CATEGORY_LABELS: Record<(typeof CATEGORIES)[number], string> = {
  quality: 'Quality',
  security: 'Security',
  efficiency: 'Efficiency',
};

/** Everything the evaluation pages need, loaded once per page. */
export async function loadEvals() {
  const [benchmarks, evals, models] = await Promise.all([
    getCollection('benchmarks'),
    getCollection('evals'),
    getCollection('models'),
  ]);
  const runs: EvalRun[] = evals.map((entry) => ({ id: entry.id, ...entry.data }));
  return {
    benchmarks: benchmarks.sort((a, b) =>
      CATEGORIES.indexOf(a.data.category) - CATEGORIES.indexOf(b.data.category)
      || a.data.name.localeCompare(b.data.name)),
    runs,
    groups: groupEvals(runs),
    modelNames: new Map(models.map((model) => [model.id, model.data.name])),
  };
}

/** At most two decimals, without trailing zeros: 62, 62.5, 62.25. */
export function formatNumber(value: number): string {
  return String(Number(value.toFixed(2)));
}

/** "62" for one distinct score, "62 (60–64)" for a range; the unit is appended by the caller. */
export function scoreRange(group: EvalGroup): string | null {
  return group.score_min === group.score_max
    ? null
    : `${formatNumber(group.score_min)}–${formatNumber(group.score_max)}`;
}
```

- [ ] **Step 5: Styles**

Append to `apps/web/src/styles/global.css`:

```css
/* ─── Evaluation tables ─── */
.eval-scroll { overflow-x: auto; margin-top: 1rem; border: 1px solid var(--u-border); border-radius: var(--u-radius); }
.eval-table { width: 100%; border-collapse: collapse; font-size: .9rem; }
.eval-table th,
.eval-table td { padding: .65rem .8rem; text-align: left; border-bottom: 1px solid var(--u-border); vertical-align: top; }
.eval-table thead th { font-size: .74rem; letter-spacing: .05em; text-transform: uppercase; color: var(--u-text-faint); background: var(--u-bg-elev); }
.eval-table tbody tr:last-child td { border-bottom: 0; }
.eval-table tbody { counter-reset: rank; }
.eval-table tbody tr:not([hidden]) td.rank::before { counter-increment: rank; content: counter(rank); color: var(--u-text-faint); }
.eval-table .num { font-variant-numeric: tabular-nums; white-space: nowrap; }
.eval-table .score { font-weight: 700; font-size: 1rem; }
.eval-table small { display: block; color: var(--u-text-faint); font-size: .76rem; }
.eval-table code { font-family: var(--u-mono); font-size: .76rem; word-break: break-all; }
```

- [ ] **Step 6: Leaderboard page**

`apps/web/src/pages/evals/index.astro`:

```astro
---
import Base from '../../layouts/Base.astro';
import { leaderboard, reproductionLabel } from '@unite4ai/core';
import { CATEGORIES, CATEGORY_LABELS, SUBMIT_GUIDE, formatNumber, loadEvals, scoreRange } from '../../lib/evals';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');
const href = (p: string) => `${base}${p}` || '/';

const { benchmarks, groups, modelNames } = await loadEvals();
const boards = benchmarks.map((benchmark) => ({
  benchmark,
  rows: leaderboard(groups, {
    id: benchmark.id,
    version: benchmark.data.version,
    higher_is_better: benchmark.data.metric.higher_is_better,
  }),
}));
const categories = CATEGORIES.filter((category) => boards.some((b) => b.benchmark.data.category === category));
const runtimes = [...new Set(boards.flatMap((b) => b.rows.flatMap((row) => row.runtimes)))].sort();
const accelerators = [...new Set(boards.flatMap((b) => b.rows.flatMap((row) => row.accelerators)))].sort();
const hasRows = boards.some((b) => b.rows.length > 0);
---
<Base title="Evaluations" description="Open models measured on contributors' own hardware: scores, speed, setup, and the command to reproduce each result.">
  <section class="wrap section">
    <p class="eyebrow">Evaluations</p>
    <h1>Open models, <span class="grad-text">measured</span> on real hardware</h1>
    <p class="lede">
      Every number here was produced on a contributor's own machine and is published with the
      exact command, the setup, and a hash of the raw output. Results are self-reported: give
      the most weight to the ones other people have reproduced.
    </p>
    <p style="margin-top:1rem">
      <a class="btn btn-primary" href={SUBMIT_GUIDE}>Submit a result</a>
      <a class="btn btn-ghost" href={href('/data/evals.json')}>Data feed (JSON)</a>
    </p>

    {hasRows && (
      <div class="registry-controls" style="margin-top:1.5rem">
        <label>
          <span class="sr-only">Filter by runtime</span>
          <select data-eval-filter="runtimes">
            <option value="">All runtimes</option>
            {runtimes.map((runtime) => <option value={runtime}>{runtime}</option>)}
          </select>
        </label>
        <label>
          <span class="sr-only">Filter by accelerator</span>
          <select data-eval-filter="accelerators">
            <option value="">All hardware</option>
            {accelerators.map((accelerator) => <option value={accelerator}>{accelerator}</option>)}
          </select>
        </label>
      </div>
    )}

    {boards.length === 0 && (
      <div class="empty" style="margin-top:2rem">No benchmarks are defined yet.</div>
    )}

    {categories.map((category) => (
      <section style="margin-top:3rem" aria-labelledby={`category-${category}`}>
        <h2 id={`category-${category}`}>{CATEGORY_LABELS[category]}</h2>
        {boards.filter((b) => b.benchmark.data.category === category).map(({ benchmark, rows }) => (
          <div style="margin-top:1.5rem">
            <h3><a href={href(`/evals/${benchmark.id}`)}>{benchmark.data.name}</a></h3>
            <p style="color:var(--u-text-dim);max-width:70ch">{benchmark.data.summary}</p>
            {rows.length === 0 ? (
              <div class="empty" style="margin-top:1rem">
                No results yet. Results arrive by pull request from people who ran this benchmark
                on their own hardware. <a href={SUBMIT_GUIDE}>How to submit one.</a>
              </div>
            ) : (
              <div class="eval-scroll">
                <table class="eval-table">
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">Model</th>
                      <th scope="col">{benchmark.data.metric.name}</th>
                      <th scope="col">Setup</th>
                      <th scope="col">Speed</th>
                      <th scope="col">Runs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr data-runtimes={row.runtimes.join(',')} data-accelerators={row.accelerators.join(',')}>
                        <td class="rank num"></td>
                        <td><a href={href(`/registry/models/${row.model}`)}>{modelNames.get(row.model) ?? row.model}</a></td>
                        <td class="num">
                          <span class="score">{formatNumber(row.score)}</span>{benchmark.data.metric.unit}
                          {scoreRange(row) && <small>range {scoreRange(row)}</small>}
                          <small>n = {row.n}</small>
                        </td>
                        <td>
                          {row.format} · {row.quantization}
                          <small>{row.runtimes.join(', ')} · {row.accelerators.join(', ')}</small>
                        </td>
                        <td class="num">{row.tokens_per_second === null ? '—' : `${formatNumber(row.tokens_per_second)} tok/s`}</td>
                        <td>
                          <span class={`tag${row.submitters.length > 1 ? ' tag-open' : ''}`}>{reproductionLabel(row)}</span>
                          <small>{row.runs} {row.runs === 1 ? 'run' : 'runs'} · latest {row.latest}</small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </section>
    ))}
  </section>

  <script is:inline>
    const filters = [...document.querySelectorAll('[data-eval-filter]')];
    const rows = [...document.querySelectorAll('.eval-table tbody tr')];
    function applyEvalFilters() {
      rows.forEach((row) => {
        row.hidden = filters.some((filter) => {
          const wanted = filter.value;
          return wanted && !(row.dataset[filter.dataset.evalFilter] ?? '').split(',').includes(wanted);
        });
      });
    }
    filters.forEach((filter) => filter.addEventListener('change', applyEvalFilters));
  </script>
</Base>
```

- [ ] **Step 7: Benchmark page**

`apps/web/src/pages/evals/[benchmark].astro`:

```astro
---
import Base from '../../layouts/Base.astro';
import { getCollection, render } from 'astro:content';
import { leaderboard, reproductionLabel } from '@unite4ai/core';
import { CATEGORY_LABELS, SUBMIT_GUIDE, formatNumber, loadEvals, scoreRange } from '../../lib/evals';

export async function getStaticPaths() {
  const benchmarks = await getCollection('benchmarks');
  return benchmarks.map((entry) => ({ params: { benchmark: entry.id }, props: { entry } }));
}

const { entry } = Astro.props;
const { Content } = await render(entry);
const d = entry.data;
const base = import.meta.env.BASE_URL.replace(/\/$/, '');
const href = (p: string) => `${base}${p}` || '/';

const { groups, runs, modelNames } = await loadEvals();
const rows = leaderboard(groups, { id: entry.id, version: d.version, higher_is_better: d.metric.higher_is_better });
const ownRuns = runs.filter((run) => run.benchmark === entry.id);
const currentRuns = ownRuns
  .filter((run) => run.benchmark_version === d.version)
  .sort((a, b) => b.run.date.localeCompare(a.run.date) || a.id.localeCompare(b.id));
const previousRuns = ownRuns
  .filter((run) => run.benchmark_version !== d.version)
  .sort((a, b) => b.run.date.localeCompare(a.run.date) || a.id.localeCompare(b.id));
const modelName = (id: string) => modelNames.get(id) ?? id;
---
<Base title={d.name} description={d.summary}>
  <article class="wrap section" data-pagefind-body>
    <p class="eyebrow"><a href={href('/evals')}>Evaluations</a> · {CATEGORY_LABELS[d.category]} · Benchmark</p>
    <h1>{d.name}</h1>
    <p class="lede">{d.summary}</p>

    <div class="card-meta" style="margin:1.2rem 0 2rem">
      <span class="tag tag-open">{d.license}</span>
      <span class="tag">version {d.version}</span>
      <span class="tag">{d.scoring}</span>
      {d.items > 0 && <span class="tag">{d.items} items</span>}
      <span class="tag">{d.metric.name}{d.metric.unit && ` (${d.metric.unit})`}, {d.metric.higher_is_better ? 'higher' : 'lower'} is better</span>
    </div>

    <h2>Leaderboard</h2>
    {rows.length === 0 ? (
      <div class="empty" style="margin-top:1rem">
        No results for version {d.version} yet. <a href={SUBMIT_GUIDE}>How to submit one.</a>
      </div>
    ) : (
      <div class="eval-scroll">
        <table class="eval-table">
          <thead>
            <tr><th scope="col">#</th><th scope="col">Model</th><th scope="col">{d.metric.name}</th><th scope="col">Setup</th><th scope="col">Speed</th><th scope="col">Runs</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr>
                <td class="rank num"></td>
                <td><a href={href(`/registry/models/${row.model}`)}>{modelName(row.model)}</a></td>
                <td class="num">
                  <span class="score">{formatNumber(row.score)}</span>{d.metric.unit}
                  {scoreRange(row) && <small>range {scoreRange(row)}</small>}
                </td>
                <td>{row.format} · {row.quantization}<small>{row.runtimes.join(', ')} · {row.accelerators.join(', ')}</small></td>
                <td class="num">{row.tokens_per_second === null ? '—' : `${formatNumber(row.tokens_per_second)} tok/s`}</td>
                <td><span class={`tag${row.submitters.length > 1 ? ' tag-open' : ''}`}>{reproductionLabel(row)}</span><small>{row.runs} {row.runs === 1 ? 'run' : 'runs'}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}

    <div class="prose" style="margin-top:2.5rem"><Content /></div>

    <p style="margin-top:1.5rem;font-size:.88rem;color:var(--u-text-faint)">
      Source: <a href={d.source_url}>{d.source_url}</a>
      {d.source_sha256 && <> · sha256 <code>{d.source_sha256}</code></>}
      · Updated {d.updated.toISOString().slice(0, 10)}
    </p>

    {[{ title: 'Every run', list: currentRuns }, { title: 'Previous versions', list: previousRuns }].map(({ title, list }) => list.length > 0 && (
      <section style="margin-top:2.5rem">
        <h2>{title}</h2>
        <p style="color:var(--u-text-dim)">Self-reported. Each row carries the command that produced it and the hash of its raw output.</p>
        <div class="eval-scroll">
          <table class="eval-table">
            <thead>
              <tr><th scope="col">Date</th><th scope="col">Model</th><th scope="col">Score</th><th scope="col">Setup</th><th scope="col">Submitter</th><th scope="col">Reproduce and verify</th></tr>
            </thead>
            <tbody>
              {list.map((run) => (
                <tr>
                  <td class="num">{run.run.date}<small>v{run.benchmark_version}</small></td>
                  <td><a href={href(`/registry/models/${run.model}`)}>{modelName(run.model)}</a></td>
                  <td class="num"><span class="score">{formatNumber(run.score)}</span>{d.metric.unit}<small>n = {run.n}</small></td>
                  <td>
                    {run.setup.format} · {run.setup.quantization}
                    <small>{run.setup.runtime} {run.setup.runtime_version}</small>
                    <small>{run.setup.hardware.device} · {run.setup.hardware.accelerator} · {run.setup.hardware.memory_gb} GB</small>
                    {run.perf?.tokens_per_second && <small>{formatNumber(run.perf.tokens_per_second)} tok/s</small>}
                  </td>
                  <td><a href={`https://github.com/${run.run.submitter}`}>{run.run.submitter}</a><small>{run.run.harness.name} {run.run.harness.version}</small></td>
                  <td>
                    <code>{run.run.command}</code>
                    <small>sha256 <code>{run.evidence.sha256}</code></small>
                    {run.evidence.url && <small><a href={run.evidence.url}>raw output</a></small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    ))}
  </article>
</Base>
```

- [ ] **Step 8: Run and confirm pass**

Run: `bun test apps/web/test/evals-pages.test.mjs`
Expected: `1 pass, 0 fail`.

- [ ] **Step 9: Confirm fixtures do not leak into a normal build**

Run: `bun run build >/dev/null 2>&1; grep -rl "fixture-bot" apps/web/dist | wc -l`
Expected: `0`.

If the count is not 0, Astro's content store kept fixture entries. Fix it in the test, not in the config: in `evals-pages.test.mjs`, extend the `after` hook to also run `rmSync(join(ROOT, '.astro/data-store.json'), { force: true })`, rerun both commands, and confirm `0`. Report which path you took.

- [ ] **Step 10: Type-check and commit**

Run: `bun run check 2>&1 | grep -A3 "Result"`
Expected: `0 errors`.

```bash
git add apps/web/src/lib/evals.ts apps/web/src/pages/evals apps/web/src/styles/global.css apps/web/test/fixtures/evals apps/web/test/evals-pages.test.mjs
git commit -m "Add evaluation leaderboards and benchmark pages"
```

---

### Task 6: Model page section, data feed, navigation

**Files:**
- Create: `apps/web/src/pages/data/evals.json.ts`
- Modify: `apps/web/src/pages/registry/models/[...id].astro`, `apps/web/src/layouts/Base.astro:15-23`, `apps/web/src/pages/index.astro`, `apps/web/test/evals-pages.test.mjs`

- [ ] **Step 1: Extend the page test (failing)**

Append to `apps/web/test/evals-pages.test.mjs`:

```js
test('model page lists its evaluations and local setups; the feed publishes the groups', () => {
  const model = page('registry/models/darsy-xray-analysis/index.html');
  assert.match(model, /Evaluations/);
  assert.match(model, /href="\/evals\/gsm8k-200"/);
  assert.match(model, /Runs locally on/);
  assert.match(model, /Fixture Laptop/);
  assert.match(model, /70 tok\/s/);

  const feed = JSON.parse(page('data/evals.json'));
  assert.equal(feed.schema_version, 1);
  assert.deepEqual(feed.benchmarks.map((b) => b.id), ['gsm8k-200']);
  assert.equal(feed.benchmarks[0].higher_is_better, true);
  assert.equal(feed.groups.length, 2);
  const mlx = feed.groups.find((g) => g.format === 'mlx');
  assert.equal(mlx.score, 62);
  assert.deepEqual(mlx.submitters, ['fixture-bot', 'fixture-bot-2']);
  assert.equal(feed.runs, 3);

  assert.match(page('index.html'), /href="\/evals"/);
});
```

This test reads the output of the build in the first test; `bun test` runs the tests in a file in order.

Run: `bun test apps/web/test/evals-pages.test.mjs`
Expected: first test passes, second FAILS (`/Evaluations/` not found in the model page).

- [ ] **Step 2: Data feed**

`apps/web/src/pages/data/evals.json.ts`:

```ts
import type { APIRoute } from 'astro';
import { loadEvals } from '../../lib/evals';

/**
 * Public, static data feed: benchmark definitions and aggregated groups.
 * Built at deploy time from the content collections; no timestamp, so identical content
 * produces an identical file.
 */
export const GET: APIRoute = async () => {
  const { benchmarks, groups, runs } = await loadEvals();
  const body = {
    schema_version: 1,
    notice: 'Results are self-reported by contributors. See each run for its reproduce command and evidence hash.',
    benchmarks: benchmarks.map((b) => ({
      id: b.id,
      name: b.data.name,
      category: b.data.category,
      version: b.data.version,
      metric: b.data.metric.name,
      unit: b.data.metric.unit,
      higher_is_better: b.data.metric.higher_is_better,
      scoring: b.data.scoring,
      items: b.data.items,
      license: b.data.license,
      source_url: b.data.source_url,
    })),
    groups,
    runs: runs.length,
  };
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json; charset=utf-8' } });
};
```

- [ ] **Step 3: Model page**

In `apps/web/src/pages/registry/models/[...id].astro`:

Add to the frontmatter imports:

```ts
import { localSetups, reproductionLabel } from '@unite4ai/core';
import { REPO, formatNumber, loadEvals, scoreRange } from '../../../lib/evals';
```

Add at the end of the frontmatter (after `localGuide`):

```ts
const evalData = await loadEvals();
const benchmarkById = new Map(evalData.benchmarks.map((b) => [b.id, b]));
const modelGroups = evalData.groups
  .filter((g) => g.model === entry.id && benchmarkById.get(g.benchmark)?.data.version === g.benchmark_version)
  .sort((a, b) => a.benchmark.localeCompare(b.benchmark) || a.key.localeCompare(b.key));
const setups = localSetups(evalData.runs.filter((run) => run.model === entry.id));
```

Insert between `<div class="prose"><Content /></div>` and the "Maintained by" paragraph:

```astro
    <section style="margin-top:3rem" data-pagefind-ignore>
      <h2>Evaluations</h2>
      {modelGroups.length === 0 ? (
        <p style="color:var(--u-text-dim)">
          No evaluation results yet. <a href={href('/evals')}>See the benchmarks and how results are submitted.</a>
        </p>
      ) : (
        <div class="eval-scroll">
          <table class="eval-table">
            <thead>
              <tr><th scope="col">Benchmark</th><th scope="col">Score</th><th scope="col">Setup</th><th scope="col">Speed</th><th scope="col">Runs</th></tr>
            </thead>
            <tbody>
              {modelGroups.map((group) => {
                const benchmark = benchmarkById.get(group.benchmark)!;
                return (
                  <tr>
                    <td><a href={href(`/evals/${group.benchmark}`)}>{benchmark.data.name}</a></td>
                    <td class="num">
                      <span class="score">{formatNumber(group.score)}</span>{benchmark.data.metric.unit}
                      {scoreRange(group) && <small>range {scoreRange(group)}</small>}
                    </td>
                    <td>{group.format} · {group.quantization}<small>{group.runtimes.join(', ')}</small></td>
                    <td class="num">{group.tokens_per_second === null ? '—' : `${formatNumber(group.tokens_per_second)} tok/s`}</td>
                    <td><span class={`tag${group.submitters.length > 1 ? ' tag-open' : ''}`}>{reproductionLabel(group)}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {setups.length > 0 && (
        <>
          <h3 style="margin-top:2rem">Runs locally on</h3>
          <p style="color:var(--u-text-dim)">Setups contributors have reported results from, with the best measured speed.</p>
          <div class="eval-scroll">
            <table class="eval-table">
              <thead>
                <tr><th scope="col">Runtime</th><th scope="col">Format</th><th scope="col">Hardware</th><th scope="col">Speed</th></tr>
              </thead>
              <tbody>
                {setups.map((s) => (
                  <tr>
                    <td>{s.runtime}</td>
                    <td>{s.format} · {s.quantization}</td>
                    <td>{s.device}<small>{s.accelerator} · {s.memory_gb} GB</small></td>
                    <td class="num">{s.tokens_per_second === null ? '—' : `${formatNumber(s.tokens_per_second)} tok/s`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
```

Fix the stale edit link in the same file (wrong owner and pre-monorepo path): replace

```astro
      <a href={`https://github.com/unite4ai/unite4ai.github.io/edit/main/src/content/models/${entry.id}.md`}>Suggest an edit</a>
```

with

```astro
      <a href={`${REPO}/edit/main/apps/web/src/content/models/${entry.id}.md`}>Suggest an edit</a>
```

- [ ] **Step 4: Navigation and home stat**

`apps/web/src/layouts/Base.astro`, in the `nav` array, add after the Registry entry:

```ts
  { label: 'Evals', href: '/evals' },
```

`apps/web/src/pages/index.astro`: after `const courses = await getCollection('courses');` add

```ts
const evalRuns = await getCollection('evals');
```

and after the `Open datasets` stat add

```astro
      <div class="stat"><b>{evalRuns.length}</b><span>Evaluation runs</span></div>
```

- [ ] **Step 5: Run and confirm pass**

Run: `bun test apps/web/test/evals-pages.test.mjs`
Expected: `2 pass, 0 fail`.

Run: `bun run check 2>&1 | grep -A3 "Result"`
Expected: `0 errors`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/data/evals.json.ts "apps/web/src/pages/registry/models/[...id].astro" apps/web/src/layouts/Base.astro apps/web/src/pages/index.astro apps/web/test/evals-pages.test.mjs
git commit -m "Show evaluations on model pages and publish the static data feed"
```

---

### Task 7: Production-build checks, docs, PR

**Files:**
- Modify: `apps/web/test/deployment.test.mjs`, `CONTRIBUTING.md`, `README.md`, `AGENTS.md`

- [ ] **Step 1: Extend the deployment test (the real build, no fixtures)**

In `apps/web/test/deployment.test.mjs`, change the `node:fs/promises` import to

```js
import { readFile, readdir, stat } from 'node:fs/promises';
```

and add after the existing assertions, inside the same test:

```js
  // Evaluation pages and feed exist in the real build, and test fixtures never reach it.
  const evalsHtml = await readFile(new URL('dist/evals/index.html', ROOT), 'utf8');
  assert.match(evalsHtml, /GSM8K \(first 200\)/);
  const feed = JSON.parse(await readFile(new URL('dist/data/evals.json', ROOT), 'utf8'));
  assert.equal(feed.schema_version, 1);
  assert.doesNotMatch(JSON.stringify(feed), /fixture-bot/);

  // Cost guard: GitHub Pages serves at most 1 GB; fail long before that.
  const bytes = await directorySize(new URL('dist/', ROOT));
  assert.ok(bytes < 250 * 1024 * 1024, `dist is ${bytes} bytes; the budget is 250 MB`);
```

and add at the bottom of the file:

```js
async function directorySize(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const url = new URL(entry.isDirectory() ? `${entry.name}/` : entry.name, dir);
    total += entry.isDirectory() ? await directorySize(url) : (await stat(url)).size;
  }
  return total;
}
```

Run: `bun test apps/web/test/deployment.test.mjs`
Expected: `1 pass, 0 fail`.

- [ ] **Step 2: Docs**

`CONTRIBUTING.md`: insert before `## What gets checked`:

```markdown
## Submitting an evaluation result

Evaluation results are data in this repository. One run is one JSON file in
`apps/web/src/content/evals/`, named `<model>--<benchmark>--<your-github-handle>--<YYYY-MM-DD>.json`.

- The model must already have a card in `apps/web/src/content/models/`, and the benchmark a
  definition in `apps/web/src/content/benchmarks/`.
- Run it on your own hardware and report the setup honestly: runtime, format, quantization, device.
- Keep the raw output yourself. The result file carries only its `sha256` (and, if you host
  it, an HTTPS link). Files over 16 KB are rejected.
- Include the exact command, so someone else can reproduce the run. A result that others have
  reproduced is shown as such; a lone result is shown as a single run.
- Reproducing someone else's result is as valuable as a new one: submit your own file for the
  same model, benchmark, format and quantization.

`bun run validate` checks the file the same way CI does.

Adding a benchmark is a pull request with one markdown file in `apps/web/src/content/benchmarks/`.
Scoring must be deterministic (exact match, multiple choice, canary detection, or a measured
quantity), the data must be openly licensed, and the page must state the benchmark's weaknesses.
```

In the numbered list under `## What gets checked`, add as item 4 and renumber the build item to 5:

```markdown
4. **Evaluations** — result files match the schema, reference a real model and benchmark, stay under 16 KB, and their scores fit the benchmark's range
```

`README.md`: in the `## Submit content` list add

```markdown
- Evaluation results: one JSON file per run under `apps/web/src/content/evals/` (see CONTRIBUTING)
```

and in `## Cost`, after the first sentence, add

```markdown
Evaluations follow the same rule: leaderboards and the data feed (`/data/evals.json`) are static files, runs happen on contributors' hardware, and raw output is referenced by hash instead of stored.
```

`AGENTS.md`: in the Layout bullet for `apps/web/`, change the content list to

```markdown
- `apps/web/` Astro site (unite4ai.com). Content: `apps/web/src/content/{models,datasets,benchmarks,compute,courses,events,posts,comments}/*.md` and `evals/*.json` (never invent results).
```

Run: `wc -c AGENTS.md`
Expected: under 3072.

- [ ] **Step 3: Full verification**

Run: `node scripts/agent/verify.mjs`
Expected: six `ok` lines and `{"status":"pass",…}`.

Run: `bun test 2>&1 | tail -4`
Expected: `0 fail`. Pass count = 54 (before this plan) + 21 (core) + 2 (evals pages) = 77.

Run: `git status --short`
Expected: only the four docs/test files from this task.

- [ ] **Step 4: Commit, push, open the PR**

```bash
git add apps/web/test/deployment.test.mjs CONTRIBUTING.md README.md AGENTS.md
git commit -m "Guard the build size and document evaluation submissions"
git push -u origin eval-first-hub
```

PR title: `Evaluation data model and leaderboards`. Base `main`. Body:

```markdown
## Summary
First piece of the evaluation-first hub (spec: `docs/superpowers/specs/2026-11-14-evaluation-first-hub-design.md`).

- **Data:** `benchmarks` (markdown) and `evals` (one JSON file per run) collections; schemas in `@unite4ai/schema`.
- **Validation in CI:** schema, 16 KB cap, model and benchmark cross-references, score range, filename/content agreement, no future dates, deterministic scoring kinds only.
- **Aggregation:** runs grouped by model + benchmark version + format + quantization; median, range, distinct submitters ("single run" vs "reproduced by N").
- **Pages:** `/evals` leaderboards, `/evals/<benchmark>`, an Evaluations section and "Runs locally on" list on model pages, static feed at `/data/evals.json`.
- **Content:** the GSM8K-200 benchmark definition (MIT, pinned by commit and sha256). **No results ship**: there is no runner yet and none were invented. Leaderboards show an explained empty state.
- **Cost:** everything is static; a test fails if the built site passes 250 MB.

Depends on the rename PR (its commit is included here until that merges).

## Test plan
- [ ] `bun test`: 77 pass (21 new unit tests, 2 page tests that build against fixtures in a temp dir)
- [ ] `node scripts/agent/verify.mjs` passes
- [ ] Normal build contains no fixture data (asserted in `deployment.test.mjs`)
- [ ] CI `Validate pull request` green
```

Wait for CI. Do not merge.

---

## Self-review

**Spec coverage.** Data shapes → Tasks 1 and 4. Validation rules (size, cross-refs, bounds, filename, dates, hashes, https, licence, scoring kinds) → Task 3 tests name each. Aggregation key, median, range, reproduction label → Task 2. `/evals`, `/evals/[benchmark]` with previous versions, model-page section with "Runs locally on", `/data/evals.json`, nav, home stat → Tasks 5–6. One real benchmark, no results → Task 4. Size guard (cost rule 8) → Task 7. Roadmap piece 0 → Task 0. Cost rules 1–7 are structural: nothing here adds a server, a paid service, or a model run in CI.

**Placeholder scan.** The two fixture files described by difference in Task 5 Step 1 list every changed field against the fully shown first file. No TBD/TODO.

**Type consistency.** `EvalRun`/`EvalGroup`/`BenchmarkRef`/`LocalSetup` and `median`, `groupEvals`, `leaderboard`, `reproductionLabel`, `localSetups` are defined in Task 2 and used with those names in Tasks 5–6. `loadEvals()` returns `{ benchmarks, runs, groups, modelNames }`, used with those names in Task 5 Steps 6–7 and Task 6 Steps 2–3. `formatNumber`, `scoreRange`, `REPO`, `SUBMIT_GUIDE`, `CATEGORIES`, `CATEGORY_LABELS` are defined in Task 5 Step 4. Schema field names in Task 1 match the Astro mirror in Task 4 and the fixtures.

**Known deviation from the spec.** `evals` schema objects are not strict (unknown keys are dropped by Zod rather than rejected); the 16 KB cap bounds the damage.
