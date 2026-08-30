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
    license: openLicenseEnum,
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
    // Ethics fields are REQUIRED — the schema enforces the mission.
    collection_method: z.string().min(10),
    consent: z.string().min(3),
    pii_review: z.boolean(),
    bias_notes: z.string().min(10),
    artifacts: z.array(artifact).default([]),
    domains: z.array(z.string()).default([]),
    sdg_alignment: z.array(z.number().int().min(1).max(17)).default([]),
    community_led: z.boolean().default(false),
    featured: z.boolean().default(false),
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

export const collections = { models, datasets, courses, events, posts };
