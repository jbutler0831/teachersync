// Modal sheets: a question with buttons (ask), and a form that stays open until it's saved (formSheet).
// Both work where <dialog> can't be shown as a modal (older browsers, tests) by falling back to the open attribute.
import { esc } from './dom.js';

let count = 0;

function openSheet(d) {
  document.body.append(d);
  if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
}

/** Closes a sheet with a value; its 'close' listeners see it as d.returnValue. */
export function closeSheet(d, value = '') {
  if (typeof d.close === 'function') { if (d.open) d.close(value); return; }
  d.returnValue = value;
  d.removeAttribute('open');
  d.dispatchEvent(new Event('close'));
}

function sheet(cls = '') {
  const d = document.createElement('dialog');
  d.className = `sheet${cls ? ` ${cls}` : ''}`;
  d.setAttribute('aria-labelledby', `sheetTitle${++count}`);
  return d;
}

/** A question with buttons. Resolves with the chosen button's value, or null if dismissed. */
export function ask({ title, body = '', actions, cancel = 'Cancel', cls = '' }) {
  const d = sheet(cls);
  d.innerHTML = `<form method="dialog">
    <h2 id="sheetTitle${count}">${esc(title)}</h2>
    <div class="sheet-body">${body}</div>
    <div class="sheet-actions">
      <button class="btn" value="">${esc(cancel)}</button>
      ${actions.map(a => `<button class="btn${a.primary ? ' primary' : ''}${a.danger ? ' danger' : ''}" value="${esc(a.value)}">${esc(a.label)}</button>`).join('')}
    </div>
  </form>`;
  d.querySelector('form').addEventListener('submit', e => { e.preventDefault(); closeSheet(d, e.submitter ? e.submitter.value : ''); });
  return new Promise(resolve => {
    d.addEventListener('close', () => { const v = d.returnValue; d.remove(); resolve(v || null); }, { once: true });
    openSheet(d);
  });
}

/**
 * A form in a sheet. `body` is the form's fields (HTML). On submit, onSubmit(form) returns true to close,
 * or false to stay open (after showing what's wrong). Returns { el, done }: `done` resolves true when saved,
 * false when cancelled (Cancel, Escape).
 */
export function formSheet({ title, body, submit = 'Save', onSubmit }) {
  const d = sheet('form-sheet');
  d.innerHTML = `<form novalidate>
    <h2 id="sheetTitle${count}">${esc(title)}</h2>
    <div class="sheet-body form-body">${body}</div>
    <p class="field-error form-error" role="alert" hidden></p>
    <div class="sheet-actions">
      <button class="btn" type="button" data-cancel>Cancel</button>
      <button class="btn primary" type="submit" data-submit>${esc(submit)}</button>
    </div>
  </form>`;
  const form = d.querySelector('form');
  form.addEventListener('submit', e => { e.preventDefault(); if (onSubmit(form)) closeSheet(d, 'saved'); });
  d.querySelector('[data-cancel]').addEventListener('click', () => closeSheet(d, ''));
  const done = new Promise(resolve => {
    d.addEventListener('close', () => { const v = d.returnValue; d.remove(); resolve(v === 'saved'); }, { once: true });
  });
  openSheet(d);
  // Start in the first field, not on Cancel.
  const first = form.querySelector('input:not([type="hidden"]), select, textarea');
  if (first) first.focus();
  return { el: d, done };
}

/** Shows (or clears, with '') the message under a field, and marks the field for screen readers. */
export function fieldError(form, name, message) {
  const err = form.querySelector(`[data-err="${name}"]`);
  if (err) { err.textContent = message || ''; err.hidden = !message; }
  for (const input of form.querySelectorAll(`[name="${name}"]`)) {
    if (message) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  }
}
