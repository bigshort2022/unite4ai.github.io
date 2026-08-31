import type { Artifact, Storage } from '@unite4ai/schema';

/** Shared definitions for the open & decentralized AI stack layers. */
export const STACK_LAYERS = [
  {
    id: 'data',
    label: 'Data for training',
    short: 'Open datasets with provenance',
    why: 'Tinkerers need data they can inspect, cite, and fork — not black-box corpora.',
    href: '/registry/datasets',
    cta: 'Browse datasets',
  },
  {
    id: 'compute',
    label: 'Compute',
    short: 'Training and inference without a gatekeeper',
    why: 'Open protocols let you run models on your hardware or community pools — not only vendor APIs.',
    href: '/stack/compute',
    cta: 'Browse compute options',
  },
  {
    id: 'weights',
    label: 'Model weights',
    short: 'Open weights with verifiable artifacts',
    why: 'Weights you can download, mirror, and checksum beat weights you can only API-call.',
    href: '/registry',
    cta: 'Browse models',
  },
  {
    id: 'verify',
    label: 'Verifiable outputs',
    short: 'Check artifacts and replay evaluations',
    why: 'Trust comes from reproducibility — not marketing claims about safety.',
    href: '/stack#verify',
    cta: 'Learn to verify',
  },
] as const;

export const INFERENCE_PROTOCOLS = {
  http: 'HTTP (OpenAI-compatible)',
  ollama: 'Ollama',
  'llama-server': 'llama.cpp server',
  vllm: 'vLLM',
  federated: 'Federated learning',
} as const;

export const STORAGE_PROTOCOLS = {
  https: 'HTTPS',
  ipfs: 'IPFS',
  huggingface: 'Hugging Face',
  git: 'Git',
} as const;

export function hasVerifiableArtifacts(artifacts: Artifact[] = []): boolean {
  return artifacts.some((a) => a.sha256);
}

export function hasDecentralizedStorage(storage?: Storage | null): boolean {
  if (!storage) return false;
  return Boolean(storage.content_address)
    || (storage.mirror_urls?.length ?? 0) > 0
    || ['ipfs', 'git', 'huggingface'].includes(storage.protocol ?? '');
}
