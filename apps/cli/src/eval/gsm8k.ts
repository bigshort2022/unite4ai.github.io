/**
 * GSM8K suite, benchmark version 2. The method is published on the benchmark page
 * (apps/web/src/content/benchmarks/gsm8k-200.md); change them together and bump the version.
 * Version 1 allowed 512 new tokens and scored the last number of a reply that was cut off there.
 */

/** Recorded in every transcript; bump when the prompt, the token limit or the answer rule changes. */
export const PROMPT_VERSION = 'gsm8k-2';

/** New tokens allowed per reply, reasoning included. */
export const MAX_TOKENS = 2048;

export interface Gsm8kItem {
  index: number;
  question: string;
  expected: number;
}

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

// A minus sign counts only when it does not follow a digit, so "2-5" reads as 2 and 5.
const NUMBER = /(?<!\d)-?\d[\d,]*(?:\.\d+)?/g;
const toNumber = (text: string) => Number(text.replace(/,/g, ''));
/** `1{,}234` and `1\,234`: LaTeX thousands separators, removed where they sit between digits. */
const withoutLatexSeparators = (text: string) => text.replace(/(?<=\d)(?:\{,\}|\\,)(?=\d)/g, '');

export function parseItems(source: string, limit: number): Gsm8kItem[] {
  const lines = source.split('\n').filter((line) => line.trim() !== '');
  if (lines.length < limit) throw new Error(`source has ${lines.length} items; the benchmark needs ${limit}`);
  return lines.slice(0, limit).map((line, index) => {
    const row = JSON.parse(line) as { question?: unknown; answer?: unknown };
    const marker = typeof row.answer === 'string'
      ? withoutLatexSeparators(row.answer).match(/####\s*(-?[\d,]*\.?\d+)\s*$/)
      : null;
    if (typeof row.question !== 'string' || !marker) {
      throw new Error(`item ${index + 1}: expected {question, answer ending in "#### <number>"}`);
    }
    return { index, question: row.question, expected: toNumber(marker[1]) };
  });
}

export function buildMessages(question: string): ChatMessage[] {
  return [{
    role: 'user',
    content: `${question}\n\nSolve this step by step. Finish with the final answer as a number on its own line.`,
  }];
}

/**
 * The last number in the visible reply, with thousands separators removed. A think block that
 * is never closed (the reply ran out of tokens mid-thought) hides everything after it.
 */
export function extractAnswer(reply: string): number | null {
  const visible = reply.replace(/<think>[\s\S]*?<\/think>/g, ' ').replace(/<think>[\s\S]*$/, '');
  const numbers = withoutLatexSeparators(visible).match(NUMBER);
  if (!numbers) return null;
  const value = toNumber(numbers[numbers.length - 1]);
  return Number.isFinite(value) ? value : null;
}

export function isCorrect(reply: string, expected: number): boolean {
  const answer = extractAnswer(reply);
  return answer !== null && Math.abs(answer - expected) < 1e-6;
}

/**
 * The verdict on one reply. A reply the server cut off at the token limit (finish reason
 * "length") is wrong whatever numbers it contains: its last number is where the text stopped,
 * not an answer. A server that reports no finish reason gives no sign of a cut-off.
 */
export function judge(
  reply: string,
  expected: number,
  finishReason: string | null,
): { correct: boolean; extracted: string | null } {
  if (finishReason === 'length') return { correct: false, extracted: null };
  const answer = extractAnswer(reply);
  return { correct: isCorrect(reply, expected), extracted: answer === null ? null : String(answer) };
}
