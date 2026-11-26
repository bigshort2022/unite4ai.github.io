import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import {
  CONTENT_ID,
  EVAL_ACCELERATORS,
  EVAL_CATEGORIES,
  EVAL_FORMATS,
  EVAL_RUNTIMES,
  EVAL_SCORING,
  OPEN_LICENSES,
  REPEAT_MAX_RUNS,
  FINDING_VERDICTS,
  REVIEW_VERDICTS,
  REVIEW_CHECKS,
  RESULT_ID,
} from '@unite4ai/schema';

/**
 * THE DATA MODEL.
 * These schemas ARE the backend contract. Every contribution — model card,
 * dataset card, course, event — is validated against them at build time.
 * An invalid submission fails CI and never reaches production.
 *
 * Schemas are defined here (not imported from @unite4ai/schema) so Astro uses
 * a single Zod instance. packages/schema mirrors these for the API worker.
 */

const openLicenseEnum = z.enum(OPEN_LICENSES as unknown as [string, ...string[]]);

const OPENNESS = z.enum(['open', 'documented', 'partial', 'closed']);

const PERSONAS = z.enum([
  'model-app-contributor',
  'dataset-code-contributor',
  'model-app-user',
  'ai-learner',
]);

const COURSE_TRACKS = z.enum(['open-stack', 'general']).default('general');

const artifact = z.object({
  kind: z.enum(['weights', 'dataset', 'code', 'paper', 'demo']),
  url: z.string().url(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  size_bytes: z.number().int().positive().optional(),
});

const inference = z.object({
  protocol: z.enum(['http', 'ollama', 'llama-server', 'vllm', 'federated']).optional(),
  endpoint_url: z.string().url().optional(),
  content_address: z.string().optional(),
  run_local_guide: z.string().optional(),
}).optional();

const evalBundle = z.object({
  url: z.string().url(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  reproducible: z.boolean().default(false),
}).optional();

const storage = z.object({
  protocol: z.enum(['https', 'ipfs', 'huggingface', 'git']).optional(),
  content_address: z.string().optional(),
  mirror_urls: z.array(z.string().url()).default([]),
}).optional();

const models = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/models' }),
  schema: z.object({
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
    artifacts: z.array(artifact).default([]),
    inference,
    eval_bundle: evalBundle,
    tasks: z.array(z.string()).default([]),
    domains: z.array(z.string()).default([]),
    sdg_alignment: z.array(z.number().int().min(1).max(17)).default([]),
    community_led: z.boolean().default(false),
    featured: z.boolean().default(false),
    updated: z.coerce.date(),
  }),
});

const datasets = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/datasets' }),
  schema: z.object({
    name: z.string(),
    summary: z.string().max(300),
    maintainers: z.array(z.string()).min(1),
    license: openLicenseEnum,
    collection_method: z.string().min(10),
    consent: z.string().min(3),
    pii_review: z.boolean(),
    bias_notes: z.string().min(10),
    artifacts: z.array(artifact).default([]),
    storage,
    domains: z.array(z.string()).default([]),
    sdg_alignment: z.array(z.number().int().min(1).max(17)).default([]),
    community_led: z.boolean().default(false),
    featured: z.boolean().default(false),
    updated: z.coerce.date(),
  }),
});

const compute = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/compute' }),
  schema: z.object({
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
  }),
});

const courses = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/courses' }),
  schema: z.object({
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
  }),
});

const events = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/events' }),
  schema: z.object({
    title: z.string(),
    summary: z.string().max(300),
    starts: z.coerce.date(),
    ends: z.coerce.date().optional(),
    kind: z.enum(['workshop', 'webinar', 'hackathon', 'meetup', 'office-hours']),
    location: z.string().default('Online'),
    register_url: z.string().url().optional(),
  }),
});

const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    summary: z.string().max(300),
    author: z.string(),
    published: z.coerce.date(),
    tags: z.array(z.string()).default([]),
  }),
});

/** Git-backed reader comments — rendered like a newspaper comments tray; live replies via Giscus. */
const comments = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/comments' }),
  schema: z.object({
    post: z.string().min(1),
    author: z.string().min(1),
    author_note: z.string().optional(),
    published: z.coerce.date(),
    recommends: z.number().int().nonnegative().default(0),
    parent: z.string().optional(),
  }),
});

const httpsUrl = z.string().url().refine((value) => value.startsWith('https://'), { message: 'must be an https URL' });
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/, 'must be a 64-character lowercase hex sha256');
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

// Mirrors the evaluation setup and public provenance schemas in @unite4ai/schema.
const evalIdentity = z.string().regex(/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/, 'must be a lowercase GitHub handle');
const evalHardware = z.strictObject({
  device: line(200),
  accelerator: z.enum(EVAL_ACCELERATORS),
  memory_gb: z.number().positive(),
});
const evalPublicUrl = evidenceUrl.refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return !url.username && !url.password && !url.search && !url.hash;
}, 'must not carry credentials, a query, or a fragment');
const baselines = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/baselines', generateId: ({ entry }) => entry }),
  schema: z.strictObject({
    benchmark: contentId,
    benchmark_version: line(50, 'must be a quoted version string'),
    entries: z.array(z.strictObject({
      id: contentId,
      model: contentId,
      model_card: evalPublicUrl.optional(),
      served_model: line(300),
      submitter: evalIdentity,
      runtime: z.enum(EVAL_RUNTIMES),
      provider: contentId.max(100).optional(),
      format: z.enum(EVAL_FORMATS),
      quantization: line(100),
      hardware: evalHardware,
      registered_on: z.iso.date(),
      withdrawal: z.strictObject({ date: z.iso.date(), reason: line(500).refine((s) => s.trim().length > 0) }).optional(),
    }).refine((entry) => (entry.runtime === 'api') === (entry.provider !== undefined), {
      path: ['provider'], message: 'is required for API baselines and forbidden on local baselines',
    }).refine((entry) => entry.runtime !== 'api' || (entry.format === 'other' && entry.quantization === 'undisclosed'), {
      path: ['format'], message: 'API baselines require format other and quantization undisclosed',
    })).min(1).max(100),
  }),
});
const evalApi = z.strictObject({
  provider: contentId.max(100),
  model_card: evalPublicUrl.optional(),
  terms_url: evalPublicUrl,
  terms_checked_on: z.iso.date(),
  expected_usd: z.number().nonnegative(),
  approved_usd: z.number().positive(),
}).refine(({ expected_usd, approved_usd }) => expected_usd <= approved_usd, {
  path: ['expected_usd'],
  message: 'must not exceed approved_usd',
});
const costTotals = { total_usd: z.number().nonnegative(), usd_per_success: z.number().nonnegative().optional() };
const evalCost = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('models-dev'),
    snapshot_date: z.iso.date(),
    snapshot_sha256: sha256Hex,
    input_usd_per_million: z.number().nonnegative(),
    output_usd_per_million: z.number().nonnegative(),
    ...costTotals,
  }),
  z.strictObject({ kind: z.literal('invoice'), invoice_sha256: sha256Hex, ...costTotals }),
]);

/** Mirrors repeatMethodSchema and repeatResultSchema in @unite4ai/schema field for field. */
const percentage = z.number().min(0).max(100);
const repeatMethodShape = {
  runs: z.number().int().min(2).max(REPEAT_MAX_RUNS),
  temperature: z.number().min(0).max(2),
  top_p: z.number().gt(0).max(1),
};
const repeatResult = z.strictObject({
  ...repeatMethodShape,
  item_pass_histogram: z.array(z.number().int().nonnegative()).max(REPEAT_MAX_RUNS + 1),
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
  energy_wh_total: z.number().positive().optional(),
});

/**
 * A benchmark definition. Mirrors benchmarkSchema in @unite4ai/schema field for field.
 * The directory is flat: the validator rejects subfolders, so the loader does not read them.
 */
const benchmarks = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/benchmarks' }),
  schema: z.strictObject({
    name: z.string().min(1),
    summary: z.string().max(300),
    category: z.enum(EVAL_CATEGORIES),
    version: line(50, 'must be a quoted string, e.g. version: "1"'),
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
    items: z.number().int().nonnegative(),
    measured_on: contentId.optional(),
    repeat: z.strictObject(repeatMethodShape).optional(),
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
  }),
});

/**
 * One evaluation run per JSON file, in a flat directory. Mirrors evalResultSchema in
 * @unite4ai/schema field for field. U4AI_EVALS_DIR lets the page tests build against fixtures;
 * production never sets it, and an empty value falls back rather than globbing the app root.
 */
const evals = defineCollection({
  loader: glob({ pattern: '*.json', base: process.env.U4AI_EVALS_DIR || './src/content/evals' }),
  schema: z.strictObject({
    schema_version: z.literal(1),
    model: contentId,
    benchmark: contentId,
    benchmark_version: line(50),
    score: z.number(),
    n: z.number().int().positive(),
    run: z.strictObject({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD'),
      submitter: evalIdentity,
      harness: z.strictObject({ name: line(100), version: line(100) }),
      command: line(2000),
    }),
    setup: z.strictObject({
      runtime: z.enum(EVAL_RUNTIMES),
      runtime_version: line(100),
      served_model: line(300).optional(),
      format: z.enum(EVAL_FORMATS),
      quantization: line(100),
      hardware: evalHardware,
      /** What the other fields cannot say about the run, e.g. whether thinking was enabled. */
      notes: line(200).optional(),
    }),
    perf: z.strictObject({
      tokens_per_second: z.number().positive().optional(),
      time_to_first_token_ms: z.number().positive().optional(),
      peak_memory_gb: z.number().positive().optional(),
      energy_wh_per_1k_tokens: z.number().positive().optional(),
    }).optional(),
    repeat: repeatResult.optional(),
    api: evalApi.optional(),
    cost: evalCost.optional(),
    evidence: z.strictObject({
      sha256: sha256Hex,
      url: evidenceUrl.optional(),
      bytes: z.number().int().positive().optional(),
    }),
  }),
});

// Mirrors the exchange schemas in @unite4ai/schema with Astro's own Zod instance.
const exchangeText = (max: number, oneLine = false) => z.string().min(1).max(max)
  .refine((value) => value.trim().length > 0, 'must not be blank')
  .refine((value) => !/[\p{Cf}\p{Zl}\p{Zp}\u0000-\u0009\u000b-\u001f\u007f-\u009f]/u.test(value)
    && (!oneLine || !value.includes('\n')), 'must not contain control characters or forbidden line breaks')
  .refine((value) => !/<[^>]*>|!?\[[\s\S]*?\]\s*(?:\(|\[|:)/u.test(value), 'must be plain text without HTML or Markdown links');
const exchangeIdentity = z.string().regex(/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/, 'must be a lowercase GitHub handle');
const exchangeDate = z.preprocess(
  (value) => value instanceof Date && value.valueOf() % 86_400_000 === 0 ? value.toISOString().slice(0, 10) : value,
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD').refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }, 'must be a real calendar date'),
);
const exchangeAgent = z.strictObject({ model: exchangeText(100, true), harness: exchangeText(100, true) });
const resultId = z.string().regex(RESULT_ID, 'must be a result file id without .json');
const graftSchema = z.strictObject({
  finding: contentId,
  sha256: sha256Hex,
  note: exchangeText(200, true),
});
// Fixture roots and their cache are isolated from production; an empty override falls back.
const exchangeRoot = process.env.U4AI_EXCHANGE_DIR || './src/content';
const hypotheses = defineCollection({
  loader: glob({ pattern: '*.md', base: `${exchangeRoot}/hypotheses` }),
  schema: z.strictObject({
    title: exchangeText(200, true),
    claim: exchangeText(600),
    benchmark: contentId,
    models: z.array(contentId).min(1),
    prediction: exchangeText(300),
    author: exchangeIdentity,
    agent: exchangeAgent.optional(),
    date: exchangeDate,
    grafts: z.array(graftSchema).optional(),
  }),
});
const findings = defineCollection({
  loader: glob({ pattern: '*.json', base: `${exchangeRoot}/findings` }),
  schema: z.strictObject({
    hypothesis: contentId,
    results: z.array(resultId).min(1),
    switch: z.strictObject({ incumbent: resultId, candidate: resultId }).optional(),
    verdict: z.enum(FINDING_VERDICTS),
    summary: exchangeText(800),
    limitations: exchangeText(600),
    author: exchangeIdentity,
    agent: exchangeAgent.optional(),
    date: exchangeDate,
    supersedes: contentId.optional(),
    grafts: z.array(graftSchema).optional(),
  }),
});
const reviews = defineCollection({
  loader: glob({ pattern: '*.json', base: `${exchangeRoot}/reviews` }),
  schema: z.strictObject({
    finding: contentId,
    finding_sha256: sha256Hex,
    verdict: z.enum(REVIEW_VERDICTS),
    checks: z.array(z.enum(REVIEW_CHECKS)).min(1),
    notes: exchangeText(600),
    reviewer: exchangeIdentity,
    agent: exchangeAgent.optional(),
    date: exchangeDate,
  }),
});

export const collections = { models, datasets, compute, courses, events, posts, comments, benchmarks, baselines, evals, hypotheses, findings, reviews };
