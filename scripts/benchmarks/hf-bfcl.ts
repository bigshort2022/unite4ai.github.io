import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { benchmarkSchema } from '../../packages/schema/src/index.ts';
import { BFCL_COMMIT } from '../../apps/cli/src/eval/bfcl.ts';
import { SUITES } from '../../apps/cli/src/eval/suites.ts';

const benchmarkId = 'bfcl-multiple-50';
const taskId = 'bfcl-multiple-50-v1-all-runs-pass-at-5';
const upstream = 'f7cf7359b7ac615a0b294831c5ba2bc95ee4a000';
const sourceRoot = `https://raw.githubusercontent.com/ShishirPatil/gorilla/${upstream}/berkeley-function-call-leaderboard/bfcl_eval/data`;
const questions = {
  url: `${sourceRoot}/BFCL_v4_multiple.json`,
  sha256: 'aef168155ebd74b7ac2401198b201343bc7d16d7a3d7e0d4e6d8ee82c6969b2a',
};
const answers = {
  url: `${sourceRoot}/possible_answer/BFCL_v4_multiple.json`,
  sha256: '244e00ce9395df948bcafc7bee64e8f9c87ef70887587d83cae45b13699f3047',
};
const expectedDataSha = '6ba53f68a27e014d46c3b40b968fb48abc05d436ffff0f98ca0fb2155c5a8d03';
const fixtures = new URL('../../apps/cli/test/fixtures/bfcl/', import.meta.url);
const templates = new URL('./hf-bfcl/', import.meta.url);
const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const scorer = 'https://github.com/bigshort2022/unite4ai.github.io/blob/d16724af190e1e76c10c53a2dbf683b79bdf0810/apps/cli/src/eval/bfcl.ts';
const datasetPath = 'data/test.jsonl';

function pinnedText(file: string, sha256: string) {
  const bytes = readFileSync(new URL(file, fixtures));
  if (digest(bytes) !== sha256) throw new Error(`${file}: BFCL input SHA-256 mismatch`);
  return bytes.toString('utf8');
}

function packageFiles() {
  const markdown = readFileSync(new URL(`../../apps/web/src/content/benchmarks/${benchmarkId}.md`, import.meta.url), 'utf8');
  const definition = benchmarkSchema.parse(Bun.YAML.parse(/^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown)?.[1] ?? ''));
  const suite = SUITES[benchmarkId];
  const { repeat, metric } = definition;
  if (BFCL_COMMIT !== upstream || definition.version !== '1' || definition.items !== 50
      || definition.source_url !== questions.url || definition.source_sha256 !== questions.sha256
      || definition.scoring !== 'exact-match' || definition.license !== 'apache-2.0'
      || metric.name !== 'correct on every run' || metric.unit !== '%' || !metric.higher_is_better || metric.min !== 0 || metric.max !== 100
      || repeat?.runs !== 5 || repeat.temperature !== 0.7 || repeat.top_p !== 1
      || suite.promptVersion !== 'bfcl-multiple-1' || suite.maxTokens !== 1024
      || suite.answers?.url !== answers.url || suite.answers.sha256 !== answers.sha256) {
    throw new Error('BFCL v1 no longer matches this Hub task; review the method before producing another package');
  }
  const items = suite.items(pinnedText('BFCL_v4_multiple.json', questions.sha256), definition.items,
    pinnedText('BFCL_v4_multiple_possible_answer.json', answers.sha256));
  const data = `${items.map(({ index, messages, expected }) => JSON.stringify({
    id: `multiple_${index}`, system: messages[0].content, user: messages[1].content, answer_json: expected,
  })).join('\n')}\n`;
  const datasetSha = digest(data);
  if (datasetSha !== expectedDataSha) throw new Error('BFCL v1 dataset bytes changed; do not reuse this Hub task');
  const method = {
    schema_version: 1,
    benchmark: benchmarkId,
    benchmark_version: definition.version,
    task_id: taskId,
    dataset: { config: 'default', split: 'test', path: datasetPath, items: items.length, sha256: datasetSha },
    case_order: { first: 'multiple_0', last: 'multiple_49', order: 'numeric ascending' },
    source: { repository: 'ShishirPatil/gorilla', commit: upstream, license: definition.license, questions, answers },
    prompt_version: suite.promptVersion,
    max_tokens: suite.maxTokens,
    scorer,
    repeat: { ...repeat, order: 'run-major, file order within pass', seed: 'run * 50 + item' },
    metric: { id: 'all-runs-pass-at-5', unit: metric.unit, higher_is_better: metric.higher_is_better },
  };
  const readme = readFileSync(new URL('README.md', templates));
  const config = readFileSync(new URL('eval.yaml', templates));
  const spec = Bun.YAML.parse(config.toString('utf8')) as { tasks?: { id: string; config: string; split: string }[]; leaderboard?: { base_models_only: boolean }; evaluation_framework?: unknown };
  const task = spec?.tasks?.[0];
  if (!Array.isArray(spec?.tasks) || spec.tasks.length !== 1 || task?.id !== taskId || task.config !== 'default' || task.split !== 'test'
      || spec.leaderboard?.base_models_only !== false || Object.hasOwn(spec, 'evaluation_framework')) {
    throw new Error('eval.yaml does not declare the exact external-scored BFCL v1 task');
  }
  const files = new Map<string, Buffer>([
    ['README.md', readme], ['eval.yaml', config], ['LICENSE', readFileSync(new URL('LICENSE', fixtures))],
    [datasetPath, Buffer.from(data)], ['method.json', Buffer.from(`${JSON.stringify(method, null, 2)}\n`)],
  ]);
  const receipt = {
    benchmark: benchmarkId, benchmark_version: definition.version, task_id: taskId, items: items.length,
    files: Object.fromEntries(Array.from(files, ([path, bytes]) => [path, digest(bytes)])),
  };
  return { files, receipt };
}

export function writeHfBfclPackage(directory: string) {
  const { files, receipt } = packageFiles();
  const root = resolve(directory);
  mkdirSync(root); // New path only; never stage into an existing directory.
  mkdirSync(join(root, 'data'));
  for (const [path, bytes] of files) writeFileSync(join(root, path), bytes, { flag: 'wx' });
  return receipt;
}

function realPathOfType(path: string, type: 'directory' | 'file') {
  const entry = lstatSync(path, { throwIfNoEntry: false });
  if (!(type === 'directory' ? entry?.isDirectory() : entry?.isFile())) throw new Error(`${path}: expected a regular ${type}`);
}

export function checkHfBfclPackage(directory: string) {
  const { files, receipt } = packageFiles();
  const root = resolve(directory);
  realPathOfType(root, 'directory');
  realPathOfType(join(root, 'data'), 'directory');
  for (const [path, bytes] of files) {
    const target = join(root, path);
    realPathOfType(target, 'file');
    if (!readFileSync(target).equals(bytes)) throw new Error(`${path}: package bytes differ from the reviewed BFCL task`);
  }
  return receipt;
}

if (import.meta.main) {
  const [command, directory, ...extra] = process.argv.slice(2);
  if (!directory || extra.length || (command !== 'build' && command !== 'check')) {
    console.error('Usage: bun scripts/benchmarks/hf-bfcl.ts (build|check) <directory>');
    process.exitCode = 2;
  } else {
    try {
      const receipt = command === 'build' ? writeHfBfclPackage(directory) : checkHfBfclPackage(directory);
      console.log(JSON.stringify(receipt));
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
