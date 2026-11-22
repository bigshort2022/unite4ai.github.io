// Inlined synchronously in Base's head, before any page content can paint.
(() => {
  const key = 'u4ai-theme';
  const root = document.documentElement;
  const sheet = document.getElementById('light-theme');
  const system = window.matchMedia('(prefers-color-scheme: light)');
  const valid = (value) => value === 'light' || value === 'dark';
  let choice;
  let button;
  try {
    const saved = window.localStorage.getItem(key);
    if (valid(saved)) choice = saved;
  } catch { /* Storage is optional; the switch still works for this page. */ }

  const syncEmbeds = () => {
    // Existing Giscus integrations only. Never create or enable an embed.
    const theme = root.dataset.theme === 'light' ? 'light' : 'transparent_dark';
    document.querySelectorAll('script[src="https://giscus.app/client.js"]').forEach((script) => {
      script.setAttribute('data-theme', theme);
    });
    document.querySelectorAll('iframe.giscus-frame').forEach((frame) => {
      frame.contentWindow?.postMessage({ giscus: { setConfig: { theme } } }, 'https://giscus.app');
    });
  };
  const apply = () => {
    const theme = choice ?? (system.matches ? 'light' : 'dark');
    root.dataset.theme = theme;
    sheet.media = theme === 'light' ? 'all' : 'not all';
    if (button) {
      button.textContent = theme === 'light' ? 'Dark mode' : 'Light mode';
      syncEmbeds();
    }
  };
  apply();
  system.addEventListener('change', apply);
  window.addEventListener('storage', (event) => {
    if (event.key !== key && event.key !== null) return;
    choice = valid(event.newValue) ? event.newValue : undefined;
    apply();
  });
  document.addEventListener('DOMContentLoaded', () => {
    button = document.querySelector('[data-theme-toggle]');
    if (!button) return;
    button.addEventListener('click', () => {
      choice = root.dataset.theme === 'light' ? 'dark' : 'light';
      try { window.localStorage.setItem(key, choice); } catch { /* In-memory choice remains usable. */ }
      apply();
    });
    apply();
    button.hidden = false;
    // Capture iframe loads too: a lazy Giscus frame may arrive after DOMContentLoaded.
    document.addEventListener('load', (event) => {
      if (event.target.matches?.('iframe.giscus-frame')) syncEmbeds();
    }, true);
  });
})();
