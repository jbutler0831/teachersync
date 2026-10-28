// A short message at the bottom of the screen, with an optional action ("Undo", "Reload").
// Ported from SemesterSync: plain messages stay 2.6 seconds, ones with an action 8 seconds.
let timer;

export function toast(msg, action) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toast-act';
    b.textContent = action.label;
    b.onclick = () => { t.classList.remove('show', 'act'); action.fn(); };
    t.append(b);
  }
  t.classList.toggle('act', !!action);
  t.classList.add('show');
  clearTimeout(timer);
  timer = setTimeout(() => t.classList.remove('show', 'act'), action ? 8000 : 2600);
}
