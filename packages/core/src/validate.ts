import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { OPEN_LICENSE_SET, OPEN_WASHED } from '@unite4ai/schema';
import { validateEvals } from './validate-evals.ts';
import { readExchangeRecords } from './read-exchange.ts';
import { validateExchange } from './exchange.ts';
import { readExchangeProfiles, validateProfiles } from './profiles.ts';

export interface ValidateResult {
  errors: string[];
  warnings: string[];
}

function frontmatter(raw: string, file: string, errors: string[]): Record<string, string> | null {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) {
    errors.push(`${file}: missing YAML frontmatter (the --- block at the top)`);
    return null;
  }
  const out: Record<string, string> = {};
  let currentKey: string | null = null;
  for (const line of m[1].split(/\r?\n/)) {
    if (/^\s*#/.test(line) || !line.trim()) continue;
    const top = line.match(/^([a-z_]+):\s*(.*)$/i);
    if (top) {
      currentKey = top[1];
      out[currentKey] = top[2].trim();
    } else if (currentKey && /^\s+/.test(line)) {
      out[currentKey] = (out[currentKey] ? `${out[currentKey]} ` : '') + line.trim();
    }
  }
  return out;
}

const unquote = (v = '') => v.replace(/^["']|["']$/g, '').trim();

export async function validateContent(contentRoot: string): Promise<ValidateResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  async function checkDir(dir: string, checks: (fm: Record<string, string>, rel: string, raw: string) => void) {
    let files: string[] = [];
    try {
      files = await readdir(join(contentRoot, dir));
    } catch {
      return;
    }
    for (const f of files.filter((x) => /\.mdx?$/.test(x))) {
      const rel = `${dir}/${f}`;
      const raw = await readFile(join(contentRoot, dir, f), 'utf8');
      const fm = frontmatter(raw, rel, errors);
      if (!fm) continue;
      checks(fm, rel, raw);
    }
  }

  const licenseCheck = (fm: Record<string, string>, rel: string) => {
    const lic = unquote(fm.license || '').toLowerCase();
    if (!lic) {
      errors.push(`${rel}: missing "license"`);
      return;
    }
    if (OPEN_WASHED[lic]) {
      errors.push(`${rel}: license "${lic}" is not open. ${OPEN_WASHED[lic]}`);
    } else if (!OPEN_LICENSE_SET.has(lic)) {
      errors.push(
        `${rel}: license "${lic}" is not on the allowlist.\n` +
        `    Allowed: ${[...OPEN_LICENSE_SET].join(', ')}\n` +
        `    If this license is genuinely open, propose adding it in a separate PR.`,
      );
    }
  };

  const requireFields = (fields: string[]) => (fm: Record<string, string>, rel: string) => {
    for (const key of fields) {
      if (!fm[key] || !unquote(fm[key])) errors.push(`${rel}: missing required field "${key}"`);
    }
  };

  await checkDir('models', (fm, rel, raw) => {
    licenseCheck(fm, rel);
    requireFields(['name', 'summary', 'maintainers', 'updated'])(fm, rel);
    for (const axis of ['weights:', 'training_data:', 'training_code:', 'evaluation:']) {
      if (!raw.includes(axis)) errors.push(`${rel}: openness axis "${axis.replace(':', '')}" not declared`);
    }
    for (const [, hash] of raw.matchAll(/sha256:\s*["']?([^"'\s]+)/g)) {
      if (!/^[a-f0-9]{64}$/.test(hash)) errors.push(`${rel}: sha256 "${hash}" is not a valid 64-char hex digest`);
    }
    if (!/##\s/.test(raw)) warnings.push(`${rel}: card body has no sections — reviewers will ask for more detail`);
    const hasWeightArtifact = /kind:\s+weights/m.test(raw);
    const hasSha256 = /sha256:\s+[a-f0-9]{64}/m.test(raw);
    if (hasWeightArtifact && !hasSha256) {
      warnings.push(`${rel}: weight artifact listed without sha256 — add a checksum for verifiable outputs`);
    }
    if (/artifacts:\s*\n/m.test(raw) && !hasSha256 && /url:\s+https?:/m.test(raw)) {
      warnings.push(`${rel}: HTTPS-only artifact with no sha256 or content address — consider mirrors or IPFS for decentralization`);
    }
  });

  await checkDir('datasets', (fm, rel, raw) => {
    licenseCheck(fm, rel);
    requireFields([
      'name', 'summary', 'maintainers', 'updated',
      'collection_method', 'consent', 'pii_review', 'bias_notes',
    ])(fm, rel);
    if (fm.bias_notes && unquote(fm.bias_notes).length < 20) {
      errors.push(`${rel}: "bias_notes" is too short. Name the populations under-represented.`);
    }
    if (/artifacts:\s*\n\s+-\s/m.test(raw) && !raw.includes('storage:') && !raw.includes('content_address:')) {
      warnings.push(`${rel}: dataset artifacts without storage protocol — add storage.content_address or mirror_urls`);
    }
  });

  await checkDir('compute', (fm, rel) => {
    requireFields(['name', 'summary', 'maintainers', 'protocol', 'open_source_url', 'pricing_model', 'updated'])(fm, rel);
  });

  await checkDir('courses', (fm, rel) => {
    requireFields(['title', 'summary', 'level', 'persona', 'duration_minutes', 'author', 'updated'])(fm, rel);
    const lvl = unquote(fm.level || '');
    if (lvl && !['beginner', 'intermediate', 'advanced'].includes(lvl)) {
      errors.push(`${rel}: level "${lvl}" must be beginner, intermediate, or advanced`);
    }
  });

  await checkDir('events', requireFields(['title', 'summary', 'starts', 'kind']));
  await checkDir('posts', requireFields(['title', 'summary', 'author', 'published']));
  await checkDir('comments', (fm, rel) => {
    requireFields(['post', 'author', 'published'])(fm, rel);
    if (fm.recommends !== undefined && fm.recommends !== '' && Number.isNaN(Number(unquote(fm.recommends)))) {
      errors.push(`${rel}: "recommends" must be a number`);
    }
  });

  const catalog = await validateEvals(contentRoot, errors, warnings);
  const exchange = await readExchangeRecords(contentRoot);
  errors.push(...exchange.errors, ...validateExchange(exchange.records, catalog));
  const profiles = await readExchangeProfiles(contentRoot);
  errors.push(...profiles.errors);
  if (profiles.profiles.length > 0) {
    let directoryIds = new Set<string>();
    try {
      const directory = JSON.parse(await readFile(join(contentRoot, '..', 'data', 'global-exchange.json'), 'utf8')) as { projects: { id: string }[] };
      directoryIds = new Set(directory.projects.map((p) => p.id));
    } catch {
      errors.push('exchange-profiles: cannot read data/global-exchange.json beside the content root');
    }
    errors.push(...validateProfiles(profiles.profiles, directoryIds));
  }

  return { errors, warnings };
}
