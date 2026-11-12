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
