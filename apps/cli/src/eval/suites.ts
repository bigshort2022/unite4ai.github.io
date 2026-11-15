import * as canary from './canary.ts';
import { MAX_TOKENS, PROMPT_VERSION, buildMessages, judge, parseItems, type ChatMessage } from './gsm8k.ts';

/** What the runner needs from a benchmark: its items, its prompt, and a deterministic verdict. */
export interface SuiteItem {
  index: number;
  messages: ChatMessage[];
  /** Stored in the transcript so a reader can check the verdict by hand. */
  expected: string;
  /** `finishReason` is why the server stopped: "length" at the token limit, null when it gave no reason. */
  judge(reply: string, end: { finishReason: string | null }): { correct: boolean; extracted: string | null };
}

export interface Suite {
  promptVersion: string;
  /** New tokens allowed per reply. Part of the method, so it is published on the benchmark page. */
  maxTokens: number;
  /** Builds the items from the pinned source text; throws when the source does not fit. */
  items(source: string, count: number): SuiteItem[];
  /** Path, relative to the content root, of a vendored copy of the source. Still hash-checked. */
  localSource?: string;
  /** Id of the measured benchmark that publishes this suite's decode speed, when one is defined. */
  speedBenchmark?: string;
}

const gsm8k: Suite = {
  promptVersion: PROMPT_VERSION,
  maxTokens: MAX_TOKENS,
  speedBenchmark: 'decode-speed-gsm8k-200',
  items: (source, count) => parseItems(source, count).map((item) => ({
    index: item.index,
    messages: buildMessages(item.question),
    expected: String(item.expected),
    judge: (reply, { finishReason }) => judge(reply, item.expected, finishReason),
  })),
};

const canaryInjection: Suite = {
  promptVersion: canary.PROMPT_VERSION,
  maxTokens: canary.MAX_TOKENS,
  localSource: '../../public/data/benchmarks/canary-injection-v1.jsonl',
  items: (source, count) => canary.parseItems(source, count).map((item, index) => ({
    index,
    messages: canary.buildMessages(item),
    expected: item.canary,
    // How the reply ended is not part of the canary rule: only the visible text counts.
    judge: (reply) => canary.judge(reply, item.canary),
  })),
};

/** Benchmark ids the runner can execute. A definition without a suite here cannot be run. */
export const SUITES: Record<string, Suite> = {
  'gsm8k-200': gsm8k,
  'canary-injection-v1': canaryInjection,
};
