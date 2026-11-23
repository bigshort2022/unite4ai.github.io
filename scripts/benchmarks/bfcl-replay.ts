import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { SUITES } from '../../apps/cli/src/eval/suites.ts';

interface ReplayInput {
  questions: string;
  answers: string;
  count: number;
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

const problem = replayProblem(JSON.parse(readFileSync(0, 'utf8')) as ReplayInput);
if (problem !== null) {
  console.error(problem);
  process.exitCode = 1;
}
