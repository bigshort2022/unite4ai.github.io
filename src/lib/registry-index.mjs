import { opennessScore } from './openness-score.mjs';

export function buildRegistryIndex(entries, type = 'models') {
  return entries.map((entry) => {
    const d = entry.data;
    const score = type === 'models' ? opennessScore(d.openness) : null;
    return {
      id: entry.id,
      name: type === 'models' ? d.name : d.name,
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
