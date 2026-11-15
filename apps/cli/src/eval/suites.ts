import { PROMPT_VERSION, buildMessages, extractAnswer, isCorrect, parseItems, type ChatMessage } from './gsm8k.ts';

/** What the runner needs from a benchmark: its items, its prompt, and a deterministic verdict. */
export interface SuiteItem {
  index: number;
  messages: ChatMessage[];
  /** Stored in the transcript so a reader can check the verdict by hand. */
  expected: string;
  judge(reply: string): { correct: boolean; extracted: string | null };
}

export interface Suite {
  promptVersion: string;
  /** Builds the items from the pinned source text; throws when the source does not fit. */
  items(source: string, count: number): SuiteItem[];
}

const gsm8k: Suite = {
  promptVersion: PROMPT_VERSION,
  items: (source, count) => parseItems(source, count).map((item) => ({
    index: item.index,
    messages: buildMessages(item.question),
    expected: String(item.expected),
    judge: (reply) => {
      const answer = extractAnswer(reply);
      return { correct: isCorrect(reply, item.expected), extracted: answer === null ? null : String(answer) };
    },
  })),
};

/** Benchmark ids the runner can execute. A definition without a suite here cannot be run. */
export const SUITES: Record<string, Suite> = {
  'gsm8k-200': gsm8k,
};
