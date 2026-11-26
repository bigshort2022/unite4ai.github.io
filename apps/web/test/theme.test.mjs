import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Execute the same classic script inlined before page content. Only browser boundaries
// are simulated; assertions concern the visitor's theme, control and persisted choice.
const source = readFileSync(new URL('../src/lib/theme.js', import.meta.url), 'utf8');
function browser({ light = false, saved, blocked = false } = {}) {
  const store = new Map(saved === undefined ? [] : [['u4ai-theme', saved]]);
  const events = new Map();
  const attributes = new Map();
  const button = { hidden: true, setAttribute: (key, value) => attributes.set(key, value), addEventListener: (key, fn) => events.set(`button:${key}`, fn) };
  const sheet = { media: '(prefers-color-scheme: light)' };
  const root = { dataset: {} };
  const preference = { matches: light, addEventListener: (key, fn) => events.set(`system:${key}`, fn) };
  const document = {
    documentElement: root,
    getElementById: () => sheet,
    querySelector: () => button,
    querySelectorAll: () => [],
    addEventListener: (key, fn) => events.set(`document:${key}`, fn),
  };
  const window = {
    matchMedia: () => preference,
    addEventListener: (key, fn) => events.set(`window:${key}`, fn),
    localStorage: {
      getItem(key) { if (blocked) throw new Error('denied'); return store.get(key) ?? null; },
      setItem(key, value) { if (blocked) throw new Error('denied'); store.set(key, value); },
    },
  };
  runInNewContext(source, { document, window });
  return { root, sheet, button, attributes, store,
    ready: () => events.get('document:DOMContentLoaded')(),
    click: () => events.get('button:click')(),
    system(value) { preference.matches = value; events.get('system:change')(); },
    storage(value) { events.get('window:storage')({ key: 'u4ai-theme', newValue: value, storageArea: window.localStorage }); },
  };
}

test('system light applies before DOM ready; absence of light preference stays dark', () => {
  const light = browser({ light: true });
  assert.equal(light.root.dataset.theme, 'light');
  assert.equal(light.sheet.media, 'all');
  assert.equal(light.button.hidden, true);
  const dark = browser();
  assert.equal(dark.root.dataset.theme, 'dark');
  assert.equal(dark.sheet.media, 'not all');
});

test('keyboard/native button activation persists across page loads ahead of system preference', () => {
  const page = browser({ light: true });
  page.ready();
  assert.equal(page.button.hidden, false);
  assert.equal(page.button.textContent, 'Dark mode');
  page.click();
  assert.equal(page.root.dataset.theme, 'dark');
  assert.equal(page.button.textContent, 'Light mode');
  assert.equal(page.store.get('u4ai-theme'), 'dark');
  const reload = browser({ light: true, saved: page.store.get('u4ai-theme') });
  reload.ready();
  assert.equal(reload.root.dataset.theme, 'dark');
  assert.equal(reload.button.textContent, 'Light mode');
  page.system(true);
  assert.equal(page.root.dataset.theme, 'dark');
});

test('invalid storage follows the OS and live system changes until an explicit choice', () => {
  const page = browser({ saved: 'sepia' });
  page.ready();
  page.system(true);
  assert.equal(page.root.dataset.theme, 'light');
  assert.equal(page.button.textContent, 'Dark mode');
  page.click();
  page.system(true);
  assert.equal(page.root.dataset.theme, 'dark');
});

test('unavailable storage does not strand a dead switch', () => {
  const page = browser({ light: true, blocked: true });
  page.ready();
  page.click();
  assert.equal(page.root.dataset.theme, 'dark');
  assert.equal(page.sheet.media, 'not all');
  assert.equal(page.button.textContent, 'Light mode');
  page.click();
  assert.equal(page.root.dataset.theme, 'light');
  assert.equal(page.button.textContent, 'Dark mode');
});

test('other-tab choice is respected and clearing it restores system preference', () => {
  const page = browser({ saved: 'dark', light: true });
  page.ready();
  page.storage('light');
  assert.equal(page.root.dataset.theme, 'light');
  page.storage('dark');
  assert.equal(page.root.dataset.theme, 'dark');
  page.storage(null);
  assert.equal(page.root.dataset.theme, 'light');
});
