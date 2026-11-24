import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AX_RULES, axPage, validateAxCommand, validateAxManifest } from '../src/lib/ax-task.mjs';
import { syncAxGuide } from './sync-ax-guide.mjs';

const PIN = new URL('../src/data/axi-command-manifest.json', import.meta.url);
const ruleLines = AX_RULES.map((rule) => `- ${rule}`);
const rules = ruleLines.join('\n');
const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#x27': "'" };
const decode = (value) => value.replace(/&(amp|lt|gt|quot|apos|#39|#x27);/g, (_, key) => entities[key]);

export async function checkAxBuild({ dir, site, base = '' }) {
  const root = dir instanceof URL ? fileURLToPath(dir) : resolve(dir);
  const origin = new URL(site).origin;
  const prefix = base.replace(/\/$/, '');
  const files = await readdir(root, { recursive: true, withFileTypes: true });
  const paths = new Set(files.filter((file) => file.isFile()).map((file) =>
    relative(root, join(file.parentPath, file.name)).split(sep).join('/')));
  const fail = (path, message) => { throw new Error(`AX build ${path}: ${message}`); };

  async function checkText(path, text) {
    const content = text.split('\n');
    const start = content.indexOf(ruleLines[0]);
    if (start < 0 || content.slice(start, start + AX_RULES.length).join('\n') !== rules
        || content.lastIndexOf(ruleLines[0]) !== start) fail(path, 'shared AX rules differ');
    let commandBlock = false;
    for (const line of content) {
      if (line === '```text' || (line === '```' && commandBlock)) commandBlock = !commandBlock;
      else if (commandBlock || /(^|[\s$`])unite4ai-axi(?=\s|$|`)/.test(line)) {
        if (!commandBlock || !line.startsWith('unite4ai-axi ')) fail(path, 'AX command must be on its own line in a text block');
        validateAxCommand(line.slice('unite4ai-axi '.length).split(' '));
      }
    }
    if (commandBlock) fail(path, 'unterminated AX command block');
    const linkTokens = [
      ...text.matchAll(/https?:\/\/[^\s<>()\[\]`]+/g),
      ...Array.from(text.matchAll(/\]\((\/(?!\/)[^\s)]+)\)/g), ([, target]) => [target]),
    ];
    for (const [token] of linkTokens) {
      const url = new URL(token, origin);
      if (url.origin !== origin) continue;
      if (!url.pathname.startsWith(`${prefix}/`)) fail(path, `site link outside base: ${token}`);
      const id = decodeURI(url.pathname.slice(prefix.length + 1)).replace(/\/$/, '');
      const destination = paths.has(id) ? id : (id ? `${id}/index.html` : 'index.html');
      if (!paths.has(destination)) fail(path, `missing site link ${token}`);
      if (url.hash && destination.endsWith('.html')) {
        const name = decodeURIComponent(url.hash.slice(1));
        if (!/^[a-zA-Z0-9_-]+$/.test(name)) fail(path, `invalid site fragment ${token}`);
        const html = await readFile(join(root, destination), 'utf8');
        if (!new RegExp(`\\sid=(?:"${name}"|'${name}'|${name}(?:\\s|>))`).test(html)) fail(path, `missing site fragment ${token}`);
      }
    }
  }

  for (const path of paths) {
    if (!path.endsWith('.html')) continue;
    const html = await readFile(join(root, path), 'utf8');
    const page = axPage(`${prefix}/${path.replace(/(^|\/)index\.html$/, '$1')}`, prefix);
    const toggles = [...html.matchAll(/<button\b[^>]*\sdata-ax-toggle(?=[\s=>])[^>]*>/g)];
    const prompts = [...html.matchAll(/<textarea\b[^>]*\sdata-ax-prompt(?=[\s=>])[^>]*>([\s\S]*?)<\/textarea>/g)];
    const expected = page ? 1 : 0;
    if (prompts.length !== expected || toggles.length !== expected) fail(path, `expected ${expected} AX toggle and prompt, got ${toggles.length} and ${prompts.length}`);
    if (page) await checkText(path, decode(prompts[0][1]));
  }
  await checkText('llms.txt', await readFile(join(root, 'llms.txt'), 'utf8'));
}

export function axBuildChecks() {
  let site, base;
  return {
    name: 'unite4ai-ax-build-checks',
    hooks: {
      'astro:config:done': ({ config }) => { ({ site, base } = config); },
      'astro:build:done': async ({ dir }) => {
        validateAxManifest(await readFile(PIN));
        await syncAxGuide();
        await checkAxBuild({ dir, site, base });
      },
    },
  };
}
