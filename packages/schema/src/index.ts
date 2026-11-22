import { z } from 'zod';

/** SPDX open license allowlist — shared by schema, validate, and API. */
export const OPEN_LICENSES = [
  'apache-2.0', 'mit', 'bsd-3-clause', 'cc-by-4.0', 'cc-by-sa-4.0',
  'cc0-1.0', 'gpl-3.0', 'agpl-3.0', 'lgpl-3.0', 'odc-by-1.0', 'mpl-2.0',
] as const;

export type OpenLicense = (typeof OPEN_LICENSES)[number];

export const OPEN_WASHED: Record<string, string> = {
  'llama-2': 'Restricts use above a monthly-active-user threshold.',
  'llama-3': 'Restricts use above a monthly-active-user threshold.',
  openrail: 'Contains downstream use restrictions; not an OSI-approved open license.',
  'creativeml-openrail-m': 'Contains downstream use restrictions.',
  'cc-by-nc-4.0': 'Non-commercial clause — not an open license under the OSD.',
  'cc-by-nd-4.0': 'No-derivatives clause — blocks fine-tuning and adaptation.',
  proprietary: 'Not open by any definition.',
};

export const OPEN_LICENSE_SET = new Set<string>(OPEN_LICENSES);

const openLicenseEnum = z.enum(OPEN_LICENSES);

export const OPENNESS = z.enum(['open', 'documented', 'partial', 'closed']);
export type OpennessLevel = z.infer<typeof OPENNESS>;

export const PERSONAS = z.enum([
  'model-app-contributor',
  'dataset-code-contributor',
  'model-app-user',
  'ai-learner',
]);

export const COURSE_TRACKS = z.enum(['open-stack', 'general']).default('general');

export const artifactSchema = z.object({
  kind: z.enum(['weights', 'dataset', 'code', 'paper', 'demo']),
  url: z.string().url(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  size_bytes: z.number().int().positive().optional(),
});
export type Artifact = z.infer<typeof artifactSchema>;

export const inferenceSchema = z.object({
  protocol: z.enum(['http', 'ollama', 'llama-server', 'vllm', 'federated']).optional(),
  endpoint_url: z.string().url().optional(),
  content_address: z.string().optional(),
  run_local_guide: z.string().optional(),
}).optional();
export type Inference = z.infer<typeof inferenceSchema>;

export const evalBundleSchema = z.object({
  url: z.string().url(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  reproducible: z.boolean().default(false),
}).optional();
export type EvalBundle = z.infer<typeof evalBundleSchema>;

export const storageSchema = z.object({
  protocol: z.enum(['https', 'ipfs', 'huggingface', 'git']).optional(),
  content_address: z.string().optional(),
  mirror_urls: z.array(z.string().url()).default([]),
}).optional();
export type Storage = z.infer<typeof storageSchema>;

export const modelSchema = z.object({
  name: z.string(),
  summary: z.string().max(300),
  maintainers: z.array(z.string()).min(1),
  license: openLicenseEnum,
  openness: z.object({
    weights: OPENNESS,
    training_data: OPENNESS,
    training_code: OPENNESS,
    evaluation: OPENNESS,
  }),
  artifacts: z.array(artifactSchema).default([]),
  inference: inferenceSchema,
  eval_bundle: evalBundleSchema,
  tasks: z.array(z.string()).default([]),
  domains: z.array(z.string()).default([]),
  sdg_alignment: z.array(z.number().int().min(1).max(17)).default([]),
  community_led: z.boolean().default(false),
  featured: z.boolean().default(false),
  updated: z.coerce.date(),
});
export type ModelData = z.infer<typeof modelSchema>;

export const datasetSchema = z.object({
  name: z.string(),
  summary: z.string().max(300),
  maintainers: z.array(z.string()).min(1),
  license: openLicenseEnum,
  collection_method: z.string().min(10),
  consent: z.string().min(3),
  pii_review: z.boolean(),
  bias_notes: z.string().min(10),
  artifacts: z.array(artifactSchema).default([]),
  storage: storageSchema,
  domains: z.array(z.string()).default([]),
  sdg_alignment: z.array(z.number().int().min(1).max(17)).default([]),
  community_led: z.boolean().default(false),
  featured: z.boolean().default(false),
  updated: z.coerce.date(),
});
export type DatasetData = z.infer<typeof datasetSchema>;

export const computeSchema = z.object({
  name: z.string(),
  summary: z.string().max(300),
  maintainers: z.array(z.string()).min(1),
  protocol: z.enum(['self-hosted', 'community-gpu', 'federated', 'inference-server', 'cloud-open']),
  open_source_url: z.string().url(),
  pricing_model: z.enum(['free', 'pay-per-use', 'donation', 'self-funded']),
  coverage: z.string().default('Global'),
  last_verified: z.coerce.date().optional(),
  sdg_alignment: z.array(z.number().int().min(1).max(17)).default([]),
  updated: z.coerce.date(),
});
export type ComputeData = z.infer<typeof computeSchema>;

export const courseSchema = z.object({
  title: z.string(),
  summary: z.string().max(300),
  level: z.enum(['beginner', 'intermediate', 'advanced']),
  persona: z.array(PERSONAS).min(1),
  track: COURSE_TRACKS.optional(),
  track_order: z.number().int().positive().optional(),
  duration_minutes: z.number().int().positive(),
  prerequisites: z.array(z.string()).default([]),
  outcomes: z.array(z.string()).min(1),
  author: z.string(),
  updated: z.coerce.date(),
});
export type CourseData = z.infer<typeof courseSchema>;

export const eventSchema = z.object({
  title: z.string(),
  summary: z.string().max(300),
  starts: z.coerce.date(),
  ends: z.coerce.date().optional(),
  kind: z.enum(['workshop', 'webinar', 'hackathon', 'meetup', 'office-hours']),
  location: z.string().default('Online'),
  register_url: z.string().url().optional(),
});
export type EventData = z.infer<typeof eventSchema>;

export const postSchema = z.object({
  title: z.string(),
  summary: z.string().max(300),
  author: z.string(),
  published: z.coerce.date(),
  tags: z.array(z.string()).default([]),
});
export type PostData = z.infer<typeof postSchema>;

// ─── Evaluations ─────────────────────────────────────────────────────────────

const httpsUrl = z.string().url().refine((value) => value.startsWith('https://'), { message: 'must be an https URL' });
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/, 'must be a 64-character lowercase hex sha256');

/**
 * The id grammar for content that evaluation results reference. It is a fixed point of
 * Astro's slugger, so a filename stem that matches it is exactly the collection id.
 */
export const CONTENT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const contentId = z.string().regex(CONTENT_ID, 'must be a lowercase id like my-model-7b');

/**
 * Free text that readers see or paste: one bounded line, no control or invisible formatting
 * characters. `wrongType` replaces the message for a value that is not a string at all.
 */
const line = (max: number, wrongType?: string) => z.string(wrongType ? { error: wrongType } : undefined).min(1).max(max).regex(
  /^[^\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+$/u,
  'must be a single line without control or invisible formatting characters',
);

/** A contributor's link, printed as an href. */
const evidenceUrl = line(500).url().refine((value) => value.startsWith('https://'), { message: 'must be an https URL' });

export const EVAL_CATEGORIES = ['quality', 'security', 'efficiency'] as const;
/** Deterministic scoring only: a hosted LLM judge would be a per-run API bill. */
export const EVAL_SCORING = ['exact-match', 'multiple-choice', 'canary', 'measured'] as const;
export const EVAL_RUNTIMES = ['mlx-lm', 'ollama', 'llama.cpp', 'vllm', 'transformers', 'other'] as const;
export const EVAL_FORMATS = ['mlx', 'gguf', 'safetensors', 'other'] as const;
export const EVAL_ACCELERATORS = ['apple-silicon', 'nvidia', 'amd', 'cpu', 'other'] as const;
/** Result files above this size are rejected: raw output is referenced by hash, never stored in git. */
export const EVAL_RESULT_MAX_BYTES = 16 * 1024;
/** Most runs per item a repeat-run benchmark may ask for; each run is one full pass over the items. */
export const REPEAT_MAX_RUNS = 20;
const percentage = z.number().min(0).max(100);
const repeatMethodShape = {
  runs: z.number().int().min(2).max(REPEAT_MAX_RUNS),
  temperature: z.number().min(0).max(2),
  top_p: z.number().gt(0).max(1),
};
/** How a repeat-run benchmark samples. Part of the method, so changing it is a new benchmark version. */
export const repeatMethodSchema = z.strictObject(repeatMethodShape);
export type RepeatMethod = z.infer<typeof repeatMethodSchema>;

/**
 * What a repeat-run result adds. The counts are the evidence; every rate and interval is
 * derived from them by `repeatSummary` in @unite4ai/core, and the content gate recomputes them.
 */
export const repeatResultSchema = z.strictObject({
  ...repeatMethodShape,
  /** Entry j is the number of items answered correctly in exactly j of the runs. */
  item_pass_histogram: z.array(z.number().int().nonnegative()).max(REPEAT_MAX_RUNS + 1),
  /** Items answered correctly in each run, in run order. */
  run_correct: z.array(z.number().int().nonnegative()).max(REPEAT_MAX_RUNS),
  pass_1: percentage,
  pass_1_ci: z.tuple([percentage, percentage]),
  pass_k: percentage,
  pass_k_ci: z.tuple([percentage, percentage]),
  run_score_sd: z.number().nonnegative(),
  seconds_total: z.number().nonnegative(),
  seconds_per_success: z.number().nonnegative().optional(),
  prompt_tokens_total: z.number().int().nonnegative().optional(),
  completion_tokens_total: z.number().int().nonnegative().optional(),
  prompt_tokens_per_success: z.number().nonnegative().optional(),
  completion_tokens_per_success: z.number().nonnegative().optional(),
});
export type RepeatResult = z.infer<typeof repeatResultSchema>;

/** Unknown keys are rejected throughout, so a misspelt field fails instead of being dropped. */
export const benchmarkSchema = z.strictObject({
  name: z.string().min(1),
  summary: z.string().max(300),
  category: z.enum(EVAL_CATEGORIES),
  version: line(50, 'must be a quoted string, e.g. version: "1"'),
  /** Versions that results may still carry; their runs are kept off the leaderboard and not checked against this definition. */
  previous_versions: z.array(line(50)).default([]),
  metric: z.strictObject({
    name: z.string().min(1),
    unit: z.string(),
    higher_is_better: z.boolean(),
    min: z.number().optional(),
    max: z.number().optional(),
  }).refine((metric) => metric.min === undefined || metric.max === undefined || metric.min <= metric.max, {
    path: ['min'],
    message: 'must not be greater than max',
  }),
  scoring: z.enum(EVAL_SCORING),
  /** The fixed number of items every run answers; 0 only for "measured" benchmarks, which have none. */
  items: z.number().int().nonnegative(),
  /** For a "measured" benchmark: the benchmark whose runs it is measured on. Each of its results sits beside that run's result. */
  measured_on: contentId.optional(),
  /** Set for a repeat-run benchmark: every item is answered `runs` times with this sampling. */
  repeat: repeatMethodSchema.optional(),
  source_url: httpsUrl,
  source_sha256: sha256Hex.optional(),
  license: openLicenseEnum,
  updated: z.coerce.date(),
}).refine((benchmark) => benchmark.scoring === 'measured' || benchmark.items > 0, {
  path: ['items'],
  message: 'must be greater than 0 unless scoring is "measured"',
}).refine((benchmark) => benchmark.scoring !== 'measured' || benchmark.items === 0, {
  path: ['items'],
  message: 'must be 0 when scoring is "measured"',
}).refine((benchmark) => benchmark.scoring !== 'measured' || benchmark.measured_on !== undefined, {
  path: ['measured_on'],
  message: 'is required when scoring is "measured"',
}).refine((benchmark) => benchmark.scoring === 'measured' || benchmark.measured_on === undefined, {
  path: ['measured_on'],
  message: 'is only for benchmarks whose scoring is "measured"',
}).refine((benchmark) => benchmark.scoring !== 'measured' || benchmark.repeat === undefined, {
  path: ['repeat'],
  message: 'is only for benchmarks that score items; a measured benchmark has none',
});
export type BenchmarkData = z.infer<typeof benchmarkSchema>;

export const evalResultSchema = z.strictObject({
  schema_version: z.literal(1),
  model: contentId,
  benchmark: contentId,
  benchmark_version: line(50),
  score: z.number(),
  n: z.number().int().positive(),
  run: z.strictObject({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD'),
    submitter: z.string().regex(/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/, 'must be a lowercase GitHub handle'),
    harness: z.strictObject({ name: line(100), version: line(100) }),
    command: line(2000),
  }),
  setup: z.strictObject({
    runtime: z.enum(EVAL_RUNTIMES),
    runtime_version: line(100),
    format: z.enum(EVAL_FORMATS),
    quantization: line(100),
    hardware: z.strictObject({
      device: line(200),
      accelerator: z.enum(EVAL_ACCELERATORS),
      memory_gb: z.number().positive(),
    }),
    /** What the other fields cannot say about the run, e.g. whether thinking was enabled. */
    notes: line(200).optional(),
  }),
  perf: z.strictObject({
    tokens_per_second: z.number().positive().optional(),
    time_to_first_token_ms: z.number().positive().optional(),
    peak_memory_gb: z.number().positive().optional(),
    energy_wh_per_1k_tokens: z.number().positive().optional(),
  }).optional(),
  /** Present exactly when the benchmark version is a repeat-run one; see repeatResultSchema. */
  repeat: repeatResultSchema.optional(),
  evidence: z.strictObject({
    sha256: sha256Hex,
    url: evidenceUrl.optional(),
    bytes: z.number().int().positive().optional(),
  }),
});
export type EvalResult = z.infer<typeof evalResultSchema>;

// ─── Exchange records ────────────────────────────────────────────────────────

export const FINDING_VERDICTS = ['supports', 'refutes', 'inconclusive'] as const;
export const REVIEW_VERDICTS = ['accept', 'reject', 'needs-work'] as const;
export const REVIEW_CHECKS = ['reran', 'read-transcript', 'read-results', 'read-page-only'] as const;
export const EXCHANGE_RECORD_MAX_BYTES = 16 * 1024;
export const RESULT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*--[a-z0-9]+(?:-[a-z0-9]+)*--[a-z0-9]+(?:-[a-z0-9]+)*--\d{4}-\d{2}-\d{2}--[a-f0-9]{8}$/;

/** Text is data, never Markdown or HTML. Newlines are allowed except in explicitly one-line fields. */
const exchangeText = (max: number, oneLine = false) => z.string().min(1).max(max)
  .refine((value) => value.trim().length > 0, 'must not be blank')
  .refine((value) => !/[\p{Cf}\p{Zl}\p{Zp}\u0000-\u0009\u000b-\u001f\u007f-\u009f]/u.test(value)
    && (!oneLine || !value.includes('\n')), 'must not contain control characters or forbidden line breaks')
  .refine((value) => !/<[^>]*>|!?\[[\s\S]*?\]\s*(?:\(|\[|:)/u.test(value), 'must be plain text without HTML or Markdown links');
const exchangeIdentity = z.string().regex(/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/, 'must be a lowercase GitHub handle');
const exchangeDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD').refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, 'must be a real calendar date');
const exchangeAgent = z.strictObject({ model: exchangeText(100, true), harness: exchangeText(100, true) });
export const graftSchema = z.strictObject({
  finding: contentId,
  sha256: sha256Hex,
  note: exchangeText(200, true),
});
export const hypothesisSchema = z.strictObject({
  title: exchangeText(200, true),
  claim: exchangeText(600),
  benchmark: contentId,
  models: z.array(contentId).min(1),
  prediction: exchangeText(300),
  author: exchangeIdentity,
  agent: exchangeAgent.optional(),
  date: exchangeDate,
  grafts: z.array(graftSchema).optional(),
});
export const findingSchema = z.strictObject({
  hypothesis: contentId,
  results: z.array(z.string().regex(RESULT_ID, 'must be a result file id without .json')).min(1),
  verdict: z.enum(FINDING_VERDICTS),
  summary: exchangeText(800),
  limitations: exchangeText(600),
  author: exchangeIdentity,
  agent: exchangeAgent.optional(),
  date: exchangeDate,
  supersedes: contentId.optional(),
  grafts: z.array(graftSchema).optional(),
});
export const reviewSchema = z.strictObject({
  finding: contentId,
  finding_sha256: sha256Hex,
  verdict: z.enum(REVIEW_VERDICTS),
  checks: z.array(z.enum(REVIEW_CHECKS)).min(1),
  notes: exchangeText(600),
  reviewer: exchangeIdentity,
  agent: exchangeAgent.optional(),
  date: exchangeDate,
});
export type GraftData = z.infer<typeof graftSchema>;
export type HypothesisData = z.infer<typeof hypothesisSchema>;
export type FindingData = z.infer<typeof findingSchema>;
export type ReviewData = z.infer<typeof reviewSchema>;
