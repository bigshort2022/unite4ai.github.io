const preference = 'unite4ai.ax';
const toggle = document.querySelector('[data-ax-toggle]');
const panel = document.getElementById('ax-task');
const prompt = panel?.querySelector('textarea[data-ax-prompt]');
const copy = panel?.querySelector('[data-ax-copy]');
const feedback = panel?.querySelector('[data-ax-status]');

if (toggle instanceof HTMLButtonElement && panel && prompt instanceof HTMLTextAreaElement && copy && feedback) {
  function show(enabled) {
    panel.hidden = !enabled;
    toggle.setAttribute('aria-pressed', String(enabled));
  }

  let enabled = false;
  try { enabled = localStorage.getItem(preference) === '1'; } catch { /* Storage is optional. */ }
  show(enabled);
  toggle.hidden = false;

  toggle.addEventListener('click', () => {
    enabled = !enabled;
    show(enabled);
    feedback.textContent = '';
    try { localStorage.setItem(preference, enabled ? '1' : '0'); } catch { /* Current-page state still works. */ }
  });

  copy.addEventListener('click', async () => {
    feedback.textContent = '';
    try {
      await navigator.clipboard.writeText(prompt.value);
      if (enabled) feedback.textContent = 'Agent task copied.';
    } catch {
      if (!enabled) return;
      prompt.focus();
      prompt.select();
      feedback.textContent = 'Task selected. Use your keyboard or device menu to copy it.';
    }
  });
}

export {};
