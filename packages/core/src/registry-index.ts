import { opennessScore } from './openness-score.ts';

export interface RegistryEntry<T> {
  id: string;
  data: T;
}

export interface RegistryIndexItem {
  id: string;
  name: string;
  summary: string;
  license: string;
  domains: string[];
  sdg_alignment: number[];
  community_led: boolean;
  featured: boolean;
  openness_score: number | null;
  updated: string;
  href: string;
}

export function buildRegistryIndex<T extends {
  name: string;
  summary: string;
  license: string;
  domains?: string[];
  sdg_alignment?: number[];
  community_led?: boolean;
  featured?: boolean;
  updated: Date;
  openness?: Parameters<typeof opennessScore>[0];
}>(
  entries: RegistryEntry<T>[],
  type: 'models' | 'datasets' = 'models',
): RegistryIndexItem[] {
  return entries.map((entry) => {
    const d = entry.data;
    const score = type === 'models' && d.openness ? opennessScore(d.openness) : null;
    return {
      id: entry.id,
      name: d.name,
      summary: d.summary,
      license: d.license,
      domains: d.domains ?? [],
      sdg_alignment: d.sdg_alignment ?? [],
      community_led: d.community_led ?? false,
      featured: d.featured ?? false,
      openness_score: score,
      updated: d.updated.toISOString().slice(0, 10),
      href: type === 'models' ? `/registry/models/${entry.id}` : `/registry/datasets/${entry.id}`,
    };
  });
}
