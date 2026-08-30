import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { OPEN_LICENSES } from './lib/open-licenses.mjs';

/**
 * THE DATA MODEL.
 * These schemas ARE the backend contract. Every contribution — model card,
 * dataset card, course, event — is validated against them at build time.
 * An invalid submission fails CI and never reaches production.
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

export const collections = { models, datasets, compute, courses, events, posts };
