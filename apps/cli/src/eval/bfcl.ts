/**
 * BFCL calibration slice, benchmark version 1: the first 50 items of the Berkeley Function
 * Calling Leaderboard's "multiple" category, asked in tool-selection-v1's prompted format and
 * scored by a port of BFCL's own checker (bfcl_eval/eval_checker/ast_eval/ast_checker.py at the
 * pinned commit). The method is published on the benchmark page
 * (apps/web/src/content/benchmarks/bfcl-multiple-50.md); change them together and bump the version.
 */
import type { ChatMessage } from './gsm8k.ts';
import { visibleReply } from './reply.ts';
import { lastJsonObject } from './tool-selection.ts';

/** Recorded in every transcript; bump when the prompt or the scoring rule changes. */
export const PROMPT_VERSION = 'bfcl-multiple-1';

/** New tokens allowed per reply, reasoning included; the same as tool-selection-v1. */
export const MAX_TOKENS = 1024;

/** The system message of tool-selection-v1, word for word, so both benchmarks ask the same way. */
export const SYSTEM = 'You choose and call tools for a user. You are given the user\'s request and a list of tools, '
  + 'each with a JSON Schema for its arguments. Reply with exactly one JSON object and nothing else, in this form: '
  + '{"tool": "<tool name>", "arguments": {"<argument name>": <value>}}. Use only a listed tool and only its '
  + 'parameters. Give every required parameter, and give an optional parameter only when the request asks for a '
  + 'value other than its default. Copy names, paths, identifiers and other values exactly as the request gives '
  + 'them. If none of the listed tools can carry out the request in one call, reply {"tool": null, "arguments": {}}.';

/** The commit of ShishirPatil/gorilla the slice is taken from. */
export const BFCL_COMMIT = 'f7cf7359b7ac615a0b294831c5ba2bc95ee4a000';

/** BFCL's possible answers for the same category, fetched from the same commit and pinned. */
export const ANSWERS = {
  url: `https://raw.githubusercontent.com/ShishirPatil/gorilla/${BFCL_COMMIT}/berkeley-function-call-leaderboard/bfcl_eval/data/possible_answer/BFCL_v4_multiple.json`,
  sha256: '244e00ce9395df948bcafc7bee64e8f9c87ef70887587d83cae45b13699f3047',
};

type BfclType = 'string' | 'integer' | 'float' | 'boolean' | 'array' | 'tuple' | 'dict';

export interface BfclParameter {
  type: BfclType;
  description?: string;
  items?: { type: BfclType };
  properties?: Record<string, BfclParameter>;
  [key: string]: unknown;
}

export interface BfclFunction {
  name: string;
  description: string;
  parameters: { type: 'dict'; properties: Record<string, BfclParameter>; required: string[] };
}

export interface BfclItem {
  id: string;
  request: string;
  functions: BfclFunction[];
  /** The one expected call: its function name and, per parameter, the values BFCL accepts ("" = may be left out). */
  answer: { name: string; params: Record<string, unknown[]> };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const SCALARS: string[] = ['string', 'integer', 'float', 'boolean'];

/** Throws when a parameter uses a type this port does not check the way BFCL does. */
function assertSupported(id: string, fn: BfclFunction): void {
  for (const [name, schema] of Object.entries(fn.parameters.properties)) {
    const where = `${id}: ${fn.name}.${name}`;
    if (schema.type === 'array' || schema.type === 'tuple') {
      if (!SCALARS.includes(String(schema.items?.type))) throw new Error(`${where}: arrays of ${schema.items?.type} are not supported`);
    } else if (!SCALARS.includes(schema.type) && schema.type !== 'dict') {
      throw new Error(`${where}: type ${schema.type} is not supported`);
    }
  }
}

function jsonLines(text: string): unknown[] {
  return text.split('\n').filter((line) => line.trim() !== '').map((line) => JSON.parse(line) as unknown);
}

/** The first `count` items, with the questions and the answers matched by id. */
export function parseItems(questions: string, answers: string, count: number): BfclItem[] {
  const asked = jsonLines(questions);
  const answered = jsonLines(answers);
  if (asked.length < count || answered.length < count) {
    throw new Error(`source has ${Math.min(asked.length, answered.length)} items; the benchmark needs ${count}`);
  }
  return asked.slice(0, count).map((row, index) => {
    const id = `multiple_${index}`;
    const truthRow = answered[index];
    if (!isObject(row) || row.id !== id || !isObject(truthRow) || truthRow.id !== id) throw new Error(`item ${index + 1}: expected id ${id}`);
    const turns = Array.isArray(row.question) ? row.question[0] : undefined;
    const turn = Array.isArray(turns) && turns.length === 1 ? turns[0] : undefined;
    if (!isObject(turn) || turn.role !== 'user' || typeof turn.content !== 'string') throw new Error(`${id}: expected one user message`);
    if (!Array.isArray(row.function) || !row.function.every(isObject)) throw new Error(`${id}: expected a list of functions`);
    // The function descriptions are BFCL's, pinned by hash; assertSupported checks the parts the checker reads.
    const functions: BfclFunction[] = row.function as unknown as BfclFunction[];
    functions.forEach((fn) => assertSupported(id, fn));
    const truth = truthRow.ground_truth;
    const call = Array.isArray(truth) && truth.length === 1 && isObject(truth[0]) ? Object.entries(truth[0]) : [];
    if (call.length !== 1 || !isObject(call[0][1])) throw new Error(`${id}: expected one call`);
    const [name, rawParams] = call[0];
    const params: Record<string, unknown[]> = {};
    for (const [param, accepted] of Object.entries(rawParams)) {
      if (!Array.isArray(accepted)) throw new Error(`${id}: accepted values of ${param} are not a list`);
      params[param] = accepted;
    }
    const fn = functions.find((candidate) => candidate.name === name);
    if (fn === undefined) throw new Error(`${id}: expected function ${name} is not offered`);
    // BFCL checks an accepted value of another type than the schema's by its variable path, which is not ported.
    for (const [param, accepted] of Object.entries(params)) {
      const schema = fn.parameters.properties[param];
      if (schema === undefined) throw new Error(`${id}: ${param} is not a parameter of ${name}`);
      const given = accepted.find((value) => value !== '');
      const itemType = schema.items?.type;
      const isList = schema.type === 'array' || schema.type === 'tuple';
      const fits = (given === undefined || hasType(given, schema.type))
        && (!isList || accepted.every((value) => !Array.isArray(value)
          || (itemType !== undefined && value.every((element) => hasType(element, itemType)))));
      if (!fits) throw new Error(`${id}: accepted values of ${param} are not ${schema.type}; BFCL's variable path is not ported`);
    }
    return { id, request: turn.content, functions, answer: { name, params } };
  });
}

/** BFCL's dict, float and tuple, as JSON Schema says them: object, number and array. */
const SCHEMA_TYPE: Record<string, string> = { dict: 'object', float: 'number', tuple: 'array' };

function toSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toSchema);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [
    key,
    key === 'type' && typeof inner === 'string' ? (SCHEMA_TYPE[inner] ?? inner) : toSchema(inner),
  ]));
}

export function buildMessages(item: BfclItem): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Request: ${item.request}\n\nTools:\n${JSON.stringify(item.functions.map(toSchema), null, 2)}` },
  ];
}

// ─── BFCL's checker, for the types above ─────────────────────────────────────

/** BFCL's string normalisation: spaces and , . / - _ * ^ removed, lower case, ' read as ". */
export function standardize(text: string): string {
  return text.replace(/[ ,./\-_*^]/g, '').toLowerCase().replaceAll("'", '"');
}

/** Python's ==: numbers by value, a boolean as 0 or 1 beside a number, lists and dicts element by element. */
function pyEqual(a: unknown, b: unknown): boolean {
  const numeric = (value: unknown) => typeof value === 'number' || typeof value === 'boolean';
  if (numeric(a) && numeric(b)) return Number(a) === Number(b);
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, index) => pyEqual(value, b[index]));
  if (isObject(a) && isObject(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && pyEqual(a[key], b[key]));
  }
  return a === b;
}
const pyIn = (value: unknown, list: unknown[]) => list.some((entry) => pyEqual(value, entry));
const standardizeIfString = (value: unknown) => (typeof value === 'string' ? standardize(value) : value);

/**
 * Whether a value has the parameter's type. JSON does not tell 2 from 2.0, so a whole number
 * counts as a float wherever a float is expected (BFCL itself turns an int into a float there),
 * and a number counts as an integer only when it is whole.
 */
function hasType(value: unknown, type: BfclType): boolean {
  switch (type) {
    case 'string': return typeof value === 'string';
    case 'integer': return typeof value === 'number' && Number.isInteger(value);
    case 'float': return typeof value === 'number';
    case 'boolean': return typeof value === 'boolean';
    case 'array':
    case 'tuple': return Array.isArray(value);
    case 'dict': return isObject(value);
  }
}

/**
 * BFCL's type check. For a list, the elements are checked against the item type, unless one of
 * the accepted values is not itself a list (such as "" for "may be left out"): BFCL then skips them.
 */
function typeChecks(value: unknown, schema: BfclParameter, accepted: unknown[]): boolean {
  if (!hasType(value, schema.type)) return false;
  if (schema.type !== 'array' && schema.type !== 'tuple') return true;
  if (accepted.some((entry) => !Array.isArray(entry))) return true;
  const itemType = schema.items?.type;
  return itemType !== undefined && Array.isArray(value) && value.every((element) => hasType(element, itemType));
}

/** BFCL's list check: strings in both lists normalised, then compared as Python lists. */
function listChecks(value: unknown[], accepted: unknown[]): boolean {
  const model = value.map(standardizeIfString);
  const options = accepted.map((entry) => (Array.isArray(entry) ? entry : [...String(entry)]).map(standardizeIfString));
  return pyIn(model, options);
}

/** BFCL's dict check: every given key known with an accepted value, every key it needs given. */
function dictChecks(value: Record<string, unknown>, accepted: unknown[]): boolean {
  return accepted.some((entry) => {
    if (entry === '' || !isObject(entry)) return false;
    for (const [key, given] of Object.entries(value)) {
      if (!Object.hasOwn(entry, key)) return false;
      const options = entry[key];
      if (!Array.isArray(options) || !pyIn(standardizeIfString(given), options.map(standardizeIfString))) return false;
    }
    return Object.entries(entry).every(([key, options]) => Object.hasOwn(value, key) || (Array.isArray(options) && options.includes('')));
  });
}

/**
 * BFCL's verdict on one call to an item of the "multiple" category, in Python, with the
 * expected function's description: the error type it would report, or null when the call is valid.
 */
export function checkCall(item: BfclItem, tool: string, args: Record<string, unknown>): string | null {
  if (tool !== item.answer.name) return 'wrong_func_name';
  const fn = item.functions.find((candidate) => candidate.name === tool);
  if (fn === undefined) return 'wrong_func_name';
  const { properties, required } = fn.parameters;
  for (const name of required) if (!Object.hasOwn(args, name)) return 'missing_required';
  for (const [name, value] of Object.entries(args)) {
    if (!Object.hasOwn(properties, name) || !Object.hasOwn(item.answer.params, name)) return 'unexpected_param';
    const schema = properties[name];
    const accepted = item.answer.params[name];
    if (!typeChecks(value, schema, accepted)) return 'type_error';
    let ok: boolean;
    if (schema.type === 'dict') ok = isObject(value) && dictChecks(value, accepted);
    else if (schema.type === 'string') ok = typeof value === 'string' && accepted.some((entry) => typeof entry === 'string' && standardize(entry) === standardize(value));
    else if (schema.type === 'array' || schema.type === 'tuple') ok = Array.isArray(value) && listChecks(value, accepted);
    else ok = pyIn(value, accepted);
    if (!ok) return 'value_error';
  }
  for (const [name, accepted] of Object.entries(item.answer.params)) {
    if (!Object.hasOwn(args, name) && !accepted.includes('')) return 'missing_optional';
  }
  return null;
}

/**
 * The answer is the last JSON object in the visible reply, as in tool-selection-v1. Its `tool`
 * must be a function name; its `arguments`, an object, with null values counting as left out.
 */
export function judge(reply: string, item: BfclItem): { correct: boolean; extracted: string | null } {
  const answer = lastJsonObject(visibleReply(reply));
  if (answer === null) return { correct: false, extracted: null };
  const raw = answer.arguments ?? {};
  const extracted = JSON.stringify(answer);
  if (typeof answer.tool !== 'string' || !isObject(raw)) return { correct: false, extracted };
  const args = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== null));
  return { correct: checkCall(item, answer.tool, args) === null, extracted };
}
