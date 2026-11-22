/**
 * Tool-selection suite, benchmark version 1. The method is published on the benchmark page
 * (apps/web/src/content/benchmarks/tool-selection-v1.md); change them together and bump the
 * version. The items come from scripts/benchmarks/tool-selection.mjs.
 */
import type { ChatMessage } from './gsm8k.ts';
import { visibleReply } from './reply.ts';

/** Recorded in every transcript; bump when the prompt or the scoring rule changes. */
export const PROMPT_VERSION = 'tool-selection-1';

/** New tokens allowed per reply, reasoning included. */
export const MAX_TOKENS = 1024;

type Value = string | number | boolean;

export interface ParameterSchema {
  type: 'string' | 'integer' | 'boolean';
  description: string;
  enum?: string[];
  default?: Value;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: { type: 'object'; properties: Record<string, ParameterSchema>; required: string[] };
}

export interface ToolItem {
  id: string;
  system: string;
  domain: string;
  request: string;
  tools: ToolDefinition[];
  /** `tool` is null when no listed tool can carry out the request. */
  expected: { tool: string | null; arguments: Record<string, Value> };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function parseItems(source: string, count: number): ToolItem[] {
  const lines = source.split('\n').filter((line) => line.trim() !== '');
  if (lines.length !== count) throw new Error(`source has ${lines.length} items; the benchmark needs ${count}`);
  return lines.map((line, index) => {
    const row = JSON.parse(line) as Record<string, unknown>;
    for (const key of ['id', 'system', 'domain', 'request'] as const) {
      if (typeof row[key] !== 'string' || row[key] === '') throw new Error(`item ${index + 1}: missing "${key}"`);
    }
    if (!Array.isArray(row.tools) || row.tools.length === 0) throw new Error(`item ${index + 1}: missing "tools"`);
    const expected = row.expected;
    if (!isObject(expected) || !(typeof expected.tool === 'string' || expected.tool === null) || !isObject(expected.arguments)) {
      throw new Error(`item ${index + 1}: missing "expected"`);
    }
    if (expected.tool !== null && !row.tools.some((tool) => isObject(tool) && tool.name === expected.tool)) {
      throw new Error(`item ${index + 1}: expected tool "${expected.tool}" is not among its tools`);
    }
    return row as unknown as ToolItem;
  });
}

export function buildMessages(item: ToolItem): ChatMessage[] {
  return [
    { role: 'system', content: item.system },
    { role: 'user', content: `Request: ${item.request}\n\nTools:\n${JSON.stringify(item.tools, null, 2)}` },
  ];
}

/**
 * The last JSON object in the text: of the spans from a `{` to a `}` that parse as an object, the
 * one that ends last, taking the widest such span. Code fences and prose around it do not matter.
 */
export function lastJsonObject(text: string): Record<string, unknown> | null {
  const opens: number[] = [];
  const closes: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '{') opens.push(index);
    else if (text[index] === '}') closes.push(index);
  }
  for (const end of closes.reverse()) {
    let found: Record<string, unknown> | null = null;
    for (const start of opens) {
      if (start > end) break;
      try {
        const value: unknown = JSON.parse(text.slice(start, end + 1));
        // The first success is the widest span, because opens run from left to right.
        if (isObject(value)) {
          found = value;
          break;
        }
      } catch {
        // Not a whole object from this brace; a narrower span may be.
      }
    }
    if (found !== null) return found;
  }
  return null;
}

/** Whether a given argument value is the expected one under the parameter's type. */
function same(schema: ParameterSchema, given: unknown, expected: Value): boolean {
  switch (schema.type) {
    case 'string':
      return typeof given === 'string' && given.trim() === expected;
    case 'integer':
      return typeof given === 'number' && given === expected;
    case 'boolean':
      return given === expected;
  }
}

/**
 * Whether the answer is the expected call. The tool name must match exactly. Arguments must name
 * only the tool's parameters and include every expected one with its value; a parameter the
 * request does not set must be left out or given its default. A null argument counts as left out.
 * With no correct call, the answer must be a null tool with no arguments.
 */
function matches(answer: Record<string, unknown>, item: ToolItem): boolean {
  if (!('tool' in answer)) return false;
  const raw = answer.arguments ?? {};
  if (!isObject(raw)) return false;
  const given = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== null));
  if (item.expected.tool === null) return answer.tool === null && Object.keys(given).length === 0;
  if (answer.tool !== item.expected.tool) return false;

  const { properties } = (item.tools.find((tool) => tool.name === item.expected.tool) as ToolDefinition).parameters;
  if (Object.keys(given).some((name) => !(name in properties))) return false;
  return Object.entries(properties).every(([name, schema]) => {
    const expected = item.expected.arguments[name];
    if (expected !== undefined) return name in given && same(schema, given[name], expected);
    return !(name in given) || (schema.default !== undefined && same(schema, given[name], schema.default));
  });
}

/** The answer is the last JSON object in the visible reply; a reply without one is wrong. */
export function judge(reply: string, item: ToolItem): { correct: boolean; extracted: string | null } {
  const answer = lastJsonObject(visibleReply(reply));
  if (answer === null) return { correct: false, extracted: null };
  return { correct: matches(answer, item), extracted: JSON.stringify(answer) };
}
