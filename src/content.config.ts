import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * THE DATA MODEL.
 * These schemas ARE the backend contract. Every contribution — model card,
 * dataset card, course, event — is validated against them at build time.
 * An invalid submission fails CI and never reaches production.
 */

// SPDX allowlist: mechanically blocks "open-washing" licenses.
const OPEN_LICENSES = [
  'apache-2.0', 'mit', 'bsd-3-clause', 'cc-by-4.0', 'cc-by-sa-4.0',
  'cc0-1.0', 'gpl-3.0', 'agpl-3.0', 'lgpl-3.0', 'odc-by-1.0', 'mpl-2.0',
] as const;

const OPENNESS = z.enum(['open', 'documented', 'partial', 'closed']);

const PERSONAS = z.enum([
  'model-app-contributor',
  'dataset-code-contributor',
  'model-app-user',
  'ai-learner',
]);

const artifact = z.object({
  kind: z.enum(['weights', 'dataset', 'code', 'paper', 'demo']),
  url: z.string().url(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  size_bytes: z.number().int().positive().optional(),
});

const models = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/models' }),
  schema: z.object({
    name: z.string(),
    summary: z.string().max(300),
    maintainers: z.array(z.string()).min(1),
    license: z.enum(OPEN_LICENSES),
    openness: z.object({
      weights: OPENNESS,
      training_data: OPENNESS,
      training_code: OPENNESS,
      evaluation: OPENNESS,
    }),
    artifacts: z.array(artifact).default([]),
    tasks: z.array(z.string()).default([]),
    domains: z.array(z.string()).default([]),
    sdg_alignment: z.array(z.number().int().min(1).max(17)).default([]),
    community_led: z.boolean().default(false),
    updated: z.coerce.date(),
  }),
});

const datasets = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/datasets' }),
  schema: z.object({
    name: z.string(),
    summary: z.string().max(300),
    maintainers: z.array(z.string()).min(1),
    license: z.enum(OPEN_LICENSES),
    // Ethics fields are REQUIRED — the schema enforces the mission.
    collection_method: z.string().min(10),
    consent: z.string().min(3),
    pii_review: z.boolean(),
    bias_notes: z.string().min(10),
    artifacts: z.array(artifact).default([]),
    domains: z.array(z.string()).default([]),
    sdg_alignment: z.array(z.number().int().min(1).max(17)).default([]),
    community_led: z.boolean().default(false),
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

export const collections = { models, datasets, courses, events, posts, comments };
