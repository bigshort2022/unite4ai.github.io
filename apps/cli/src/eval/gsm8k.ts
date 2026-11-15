/**
 * GSM8K suite. The method is published on the benchmark page
 * (apps/web/src/content/benchmarks/gsm8k-200.md); change them together and bump the version.
 */

/** Recorded in every transcript; bump when the prompt or the extraction rule changes. */
export const PROMPT_VERSION = 'gsm8k-1';

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

export function parseItems(source: string, limit: number): Gsm8kItem[] {
  const lines = source.split('\n').filter((line) => line.trim() !== '');
  if (lines.length < limit) throw new Error(`source has ${lines.length} items; the benchmark needs ${limit}`);
  return lines.slice(0, limit).map((line, index) => {
    const row = JSON.parse(line) as { question?: unknown; answer?: unknown };
    const marker = typeof row.answer === 'string' ? row.answer.match(/####\s*(-?[\d,]*\.?\d+)\s*$/) : null;
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

/** The last number in the visible reply, with thousands separators removed. */
export function extractAnswer(reply: string): number | null {
  const visible = reply.replace(/<think>[\s\S]*?<\/think>/g, ' ');
  const numbers = visible.match(NUMBER);
  if (!numbers) return null;
  const value = toNumber(numbers[numbers.length - 1]);
  return Number.isFinite(value) ? value : null;
}

export function isCorrect(reply: string, expected: number): boolean {
  const answer = extractAnswer(reply);
  return answer !== null && Math.abs(answer - expected) < 1e-6;
}
