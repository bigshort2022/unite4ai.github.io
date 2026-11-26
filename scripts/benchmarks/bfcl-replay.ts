import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { SUITES } from '../../apps/cli/src/eval/suites.ts';
import { repeatSummary, tallyAttempts } from '../../packages/core/src/repeat.ts';
import { evalResultSchema } from '../../packages/schema/src/index.ts';

interface ReviewInput {
  transcript: { sha256: string; bytes: number };
  header: Record<string, unknown>;
  date: string;
  result_text: string;
  result_sha256: string;
}

interface ReplayInput {
  questions: string;
  answers: string;
  count: number;
  review?: ReviewInput;
  attempts: {
    run: number;
    index: number;
    seed: number;
    prompt_sha256: string;
    reply: string;
    finish_reason: string | null;
    completion_tokens: number | null;
    extracted: string | null;
    correct: boolean;
    seconds?: number;
    prompt_tokens?: number | null;
  }[];
}

// The cross-check sends hash-verified fixture text and shape-checked attempts over stdin.
function replayProblem({ questions, answers, count, attempts }: ReplayInput): string | null {
  const suite = SUITES['bfcl-multiple-50'];
  const items = suite.items(questions, count, answers);
  const hashes = items.map(({ messages }) => createHash('sha256').update(JSON.stringify(messages)).digest('hex'));
  for (const attempt of attempts) {
    let problem: string | undefined;
    if (attempt.prompt_sha256 !== hashes[attempt.index]) {
      problem = 'prompt_sha256 does not match the pinned prompt';
    } else {
      const { extracted, correct } = items[attempt.index].judge(attempt.reply, {
        finishReason: attempt.finish_reason,
        completionTokens: attempt.completion_tokens,
        maxTokens: suite.maxTokens,
      });
      if (attempt.extracted !== extracted) problem = 'extracted does not match the replayed reply';
      else if (attempt.correct !== correct) problem = 'correct does not match the replayed verdict';
    }
    if (problem !== undefined) return `run ${attempt.run} item ${attempt.index} seed ${attempt.seed}: ${problem}`;
  }
  return null;
}

const isTokenCount = (value: unknown): value is number | null =>
  value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0);

function reviewResult({ count, attempts }: ReplayInput, review: ReviewInput) {
  let raw: unknown;
  try {
    raw = JSON.parse(review.result_text);
  } catch {
    return 'result is not valid JSON';
  }
  const parsed = evalResultSchema.safeParse(raw);
  if (!parsed.success) return 'result does not match the evaluation result schema';
  const result = parsed.data;
  if (result.benchmark !== 'bfcl-multiple-50' || result.benchmark_version !== '1' || result.n !== count
      || !result.repeat || !result.setup.served_model || result.setup.runtime === 'api'
      || result.api || result.cost || Object.hasOwn(review.header, 'api')) {
    return 'expected a local BFCL multiple 50 v1 repeat result and transcript';
  }
  if (result.evidence.sha256 !== review.transcript.sha256) return 'evidence.sha256 does not match the transcript';
  if (result.evidence.bytes !== review.transcript.bytes) return 'evidence.bytes does not match the transcript';
  if (result.run.date !== review.date) return 'run.date does not match the completion footer';
  if (result.model !== review.header.model) return 'model does not match the transcript header';
  for (const key of ['served_model', 'runtime', 'runtime_version', 'format', 'quantization'] as const) {
    if (result.setup[key] !== review.header[key]) return `setup.${key} does not match the transcript header`;
  }
  if ((result.setup.notes ?? null) !== review.header.notes) return 'setup.notes does not match the transcript header';
  if (result.repeat.energy_wh_total !== undefined) return 'repeat.energy_wh_total is not supported by the transcript';
  if (result.perf?.energy_wh_per_1k_tokens !== undefined) return 'perf.energy_wh_per_1k_tokens is not supported by the transcript';

  const normalized = [];
  for (const { run, index, correct, seconds, prompt_tokens, completion_tokens } of attempts) {
    const label = `run ${run} item ${index}`;
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return `${label}: invalid seconds`;
    if (!isTokenCount(prompt_tokens) || !isTokenCount(completion_tokens)) return `${label}: invalid token count`;
    normalized.push({ run, index, correct, seconds, promptTokens: prompt_tokens, completionTokens: completion_tokens });
  }
  // Python validates the exact transcript method and complete attempt order before invoking this worker.
  const method = review.header.repeat as { runs: number; temperature: number; top_p: number };
  const repeat = repeatSummary(method, tallyAttempts(normalized, count, method.runs));
  const keys = new Set([...Object.keys(repeat), ...Object.keys(result.repeat)] as (keyof typeof repeat)[]);
  for (const field of keys) {
    if (!isDeepStrictEqual(result.repeat[field], repeat[field])) return `repeat.${field} does not match the transcript`;
  }
  if (result.score !== repeat.pass_k) return 'score does not match the transcript';
  const { pass_1, pass_1_ci, pass_k, pass_k_ci } = repeat;
  console.log(JSON.stringify({
    schema_version: 1, scope: 'bfcl-v1-local-consistency',
    result_sha256: review.result_sha256, transcript: review.transcript,
    attempts: attempts.length, scores: { pass_1, pass_1_ci, pass_k, pass_k_ci },
    unchecked: ['independent_identity', 'approval', 'runner_checkout', 'actual_hardware', 'actual_artifact',
      'endpoint_and_execution', 'wall_clock', 'perf', 'upstream_checker_agreement'],
  }));
  return null;
}

try {
  const input = JSON.parse(readFileSync(0, 'utf8')) as ReplayInput;
  const problem = replayProblem(input) ?? (input.review ? reviewResult(input, input.review) : null);
  if (problem !== null) {
    console.error(problem);
    process.exitCode = 1;
  }
} catch {
  // Exception messages may contain the private input; only print diagnostics we construct.
  console.error('could not replay the supplied BFCL evidence');
  process.exitCode = 1;
}
