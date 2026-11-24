import { CONTENT_ID } from '@unite4ai/schema';
import type { EvalExportInput } from './eval-export-types.ts';

interface HfBinding {
  benchmark: string;
  version: string;
  dataset: string;
  task_id: string;
  revision: string;
  source_sha256: string;
  metric_unit: string;
}

type HfBindings = ReadonlyMap<string, Readonly<HfBinding>>;
type HfEvalExport = { status: 'ready'; model: string; yaml: string } | { status: 'blocked'; reasons: string[] };

const FIELDS = ['benchmark', 'version', 'dataset', 'task_id', 'revision', 'source_sha256', 'metric_unit'] as const;
const HF_REPO = /^[A-Za-z0-9_](?:[A-Za-z0-9_.-]{0,94}[A-Za-z0-9_])?\/[A-Za-z0-9_](?:[A-Za-z0-9_.-]{0,94}[A-Za-z0-9_])?$/;
const NON_LINE_CHARACTER = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const bindingKey = (benchmark: string, version: string) => `${benchmark}\0${version}`;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isLine(value: unknown): value is string {
  return typeof value === 'string' && value === value.trim() && !NON_LINE_CHARACTER.test(value);
}

function parseBinding(value: unknown, index: number): HfBinding {
  const label = `Hugging Face binding at index ${index}`;
  if (!isPlainObject(value)) throw new Error(`${label} must be a plain object`);
  if (Reflect.ownKeys(value).length !== FIELDS.length || !FIELDS.every((key) => {
    const property = Object.getOwnPropertyDescriptor(value, key);
    return property?.enumerable && 'value' in property;
  })) throw new Error(`${label} must have exactly these fields: ${FIELDS.join(', ')}`);

  const { benchmark, version, dataset, task_id, revision, source_sha256, metric_unit } = value;
  if (!isLine(benchmark) || !CONTENT_ID.test(benchmark)) throw new Error(`${label} has an invalid benchmark id`);
  if (!isLine(version) || !version || version.length > 50) throw new Error(`${label} has an invalid version`);
  if (!isLine(dataset) || !HF_REPO.test(dataset) || /--|\.\.|\.git$/.test(dataset)) {
    throw new Error(`${label} dataset must be a Hugging Face owner/repo id`);
  }
  if (!isLine(task_id) || !task_id || /\s/u.test(task_id)) throw new Error(`${label} has an invalid task_id`);
  if (!isLine(revision) || !/^[0-9a-f]{40}$/.test(revision)) throw new Error(`${label} revision must be a full commit SHA`);
  if (!isLine(source_sha256) || !/^[0-9a-f]{64}$/.test(source_sha256)) throw new Error(`${label} source_sha256 must be a SHA-256 digest`);
  if (!isLine(metric_unit)) throw new Error(`${label} metric_unit must be a string, or empty for a unitless metric`);
  return { benchmark, version, dataset, task_id, revision, source_sha256, metric_unit };
}

export function parseHfBindings(raw: unknown): HfBindings {
  if (!Array.isArray(raw)) throw new Error('Hugging Face bindings must be an array');
  const bindings = new Map<string, HfBinding>();
  for (const [index, value] of raw.entries()) {
    const binding = parseBinding(value, index);
    const key = bindingKey(binding.benchmark, binding.version);
    if (bindings.has(key)) throw new Error(`Duplicate Hugging Face binding for ${binding.benchmark} version ${binding.version}`);
    bindings.set(key, binding);
  }
  return bindings;
}

export function renderHfEval({ run, benchmark, hfModel, evidenceUrl }: EvalExportInput, bindings: HfBindings): HfEvalExport {
  const reasons: string[] = [];
  if (run.setup.runtime === 'api') reasons.push('hosted_run');
  if (!hfModel || hfModel !== run.setup.served_model) reasons.push('unverified_model_artifact');

  let binding: Readonly<HfBinding> | undefined;
  if (run.benchmark_version !== benchmark.version) reasons.push('noncurrent_benchmark_version');
  else {
    binding = bindings.get(bindingKey(run.benchmark, run.benchmark_version));
    if (!binding) reasons.push('missing_benchmark_binding');
    else {
      if (binding.source_sha256 !== benchmark.source_sha256) reasons.push('benchmark_source_mismatch');
      if (binding.metric_unit !== benchmark.metric.unit) reasons.push('metric_unit_mismatch');
    }
  }
  if (!binding || !hfModel || reasons.length) return { status: 'blocked', reasons };

  // Quote strings explicitly: date must not become a YAML timestamp, and URL syntax is not YAML syntax.
  const quote = JSON.stringify;
  const notes = `Published aggregate; unit: ${binding.metric_unit || 'unitless'}. See source for run setup and evidence.`;
  // Include a decimal point in exponent notation for YAML 1.1 readers too.
  const score = Object.is(run.score, -0) ? '-0.0' : String(run.score).replace(/^(-?\d+)e/, '$1.0e');
  const yaml = `- dataset:
    id: ${quote(binding.dataset)}
    task_id: ${quote(binding.task_id)}
    revision: ${quote(binding.revision)}
  value: ${score}
  date: ${quote(run.run.date)}
  source:
    url: ${quote(evidenceUrl)}
    name: "Unite4AI evaluation evidence"
  notes: ${quote(notes)}
`;
  return { status: 'ready', model: hfModel, yaml };
}
