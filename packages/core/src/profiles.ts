import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CONTENT_ID, PROFILE_MAX_BYTES, exchangeProfileSchema, type ExchangeProfile } from '@unite4ai/schema';
import { REFERENCE_WORKLOADS, RISK_CRITERIA, SECURITY_CRITERIA } from './profile-rubrics.ts';

export interface ProfileEntry { id: string; data: ExchangeProfile; sha256: string }

/** Reads `exchange-profiles/*.json` under a content root. Missing directory means no profiles. */
export async function readExchangeProfiles(root: string): Promise<{ profiles: ProfileEntry[]; errors: string[] }> {
  const profiles: ProfileEntry[] = [];
  const errors: string[] = [];
  const directory = join(root, 'exchange-profiles');
  try {
    if (!(await lstat(directory)).isDirectory()) return { profiles, errors: ['exchange-profiles: must be a real flat directory, not a link'] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { profiles, errors };
    return { profiles, errors: ['exchange-profiles: cannot read directory'] };
  }
  const entries = await readdir(directory, { withFileTypes: true });
  for (const item of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const file = `exchange-profiles/${item.name}`;
    if (item.isFile() && ['.gitkeep', '.DS_Store'].includes(item.name)) continue;
    if (!item.isFile() || !item.name.endsWith('.json')) {
      errors.push(`${file}: only .json files are allowed; subfolders and links are not read`);
      continue;
    }
    const id = item.name.slice(0, -'.json'.length);
    if (!CONTENT_ID.test(id)) {
      errors.push(`${file}: filename must be a lowercase id`);
      continue;
    }
    const path = join(directory, item.name);
    if ((await lstat(path)).size > PROFILE_MAX_BYTES) {
      errors.push(`${file}: exceeds the ${PROFILE_MAX_BYTES}-byte record limit`);
      continue;
    }
    let data: unknown;
    let sha256: string;
    try {
      const bytes = await readFile(path);
      sha256 = createHash('sha256').update(bytes).digest('hex');
      data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch (error) {
      errors.push(`${file}: cannot parse record (${(error as Error).message})`);
      continue;
    }
    const parsed = exchangeProfileSchema.safeParse(data);
    if (parsed.success) profiles.push({ id, data: parsed.data, sha256 });
    else errors.push(`${file}: ${parsed.error.message}`);
  }
  return { profiles, errors };
}

function citedEvidence(p: ExchangeProfile): string[] {
  const ids: string[] = [];
  const facts = [...Object.values(p.identity), ...Object.values(p.legal), ...Object.values(p.marketData), ...Object.values(p.usage)];
  for (const f of facts) if ('evidence' in f) ids.push(...f.evidence);
  for (const q of p.priceQuotes) ids.push(...q.evidence);
  for (const c of p.costComponents) if ('evidence' in c) ids.push(...c.evidence);
  for (const c of [...p.securityChecks, ...p.riskChecks]) ids.push(...c.evidence);
  return ids;
}

/** Cross-record rules the schema cannot express. */
export function validateProfiles(profiles: ProfileEntry[], directoryIds: ReadonlySet<string>): string[] {
  const errors: string[] = [];
  const security = new Set(SECURITY_CRITERIA.map((c) => c.id));
  const risk = new Set(RISK_CRITERIA.map((c) => c.id));
  const workloads = new Set<string>(REFERENCE_WORKLOADS.map((w) => w.id));
  for (const { id, data: p } of profiles) {
    const file = `exchange-profiles/${id}.json`;
    if (p.meta.directoryId !== id) errors.push(`${file}: meta.directoryId must equal the file name`);
    if (!directoryIds.has(p.meta.directoryId)) errors.push(`${file}: ${p.meta.directoryId} is not in the Global Exchange directory`);
    const evidenceKinds = new Map<string, string>();
    for (const e of p.evidence) {
      if (evidenceKinds.has(e.id)) errors.push(`${file}: evidence ${e.id} appears more than once`);
      evidenceKinds.set(e.id, e.kind);
    }
    const citesKind = (ids: string[], kind: string) => ids.some((e) => evidenceKinds.get(e) === kind);
    const cited = new Set(citedEvidence(p));
    for (const c of cited) if (!evidenceKinds.has(c)) errors.push(`${file}: cites evidence ${c}, which does not exist`);
    for (const e of evidenceKinds.keys()) if (!cited.has(e)) errors.push(`${file}: evidence ${e}: not cited by any fact or check`);
    const sections = { identity: p.identity, legal: p.legal, marketData: p.marketData, usage: p.usage };
    for (const [section, facts] of Object.entries(sections)) {
      for (const [key, fact] of Object.entries(facts)) {
        if (fact.level === 'observed' && !citesKind(fact.evidence, 'observation')) errors.push(`${file}: ${section}.${key} is observed and must cite observation evidence`);
      }
    }
    p.priceQuotes.forEach((q, i) => {
      if (q.level === 'observed' && !citesKind(q.evidence, 'observation')) errors.push(`${file}: priceQuotes[${i}] is observed and must cite observation evidence`);
    });
    for (const c of p.riskChecks) {
      if (c.criterion === 'regulatory-action' && c.outcome === 'fail' && !citesKind(c.evidence, 'regulator')) {
        errors.push(`${file}: regulatory-action is triggered and must cite regulator evidence`);
      }
    }
    for (const [key, fact] of Object.entries(p.marketData)) {
      if (fact.level !== 'not-published' && fact.level !== 'reported') errors.push(`${file}: marketData.${key} must be reported market data`);
    }
    for (const q of p.priceQuotes) if (!workloads.has(q.workload)) errors.push(`${file}: quote workload ${q.workload} is not a reference workload`);
    const checkRubric = (checks: ExchangeProfile['securityChecks'], allowed: Set<string>, name: string) => {
      const seen = new Set<string>();
      for (const c of checks) {
        if (!allowed.has(c.criterion)) errors.push(`${file}: ${c.criterion} is not a ${name} rubric criterion`);
        if (seen.has(c.criterion)) errors.push(`${file}: ${c.criterion} appears more than once in ${name} checks`);
        seen.add(c.criterion);
      }
    };
    checkRubric(p.securityChecks, security, 'security');
    checkRubric(p.riskChecks, risk, 'risk');
  }
  return errors;
}
