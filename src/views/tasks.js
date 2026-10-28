// Tasks: everything else a teacher has to do. Quick Add (a title and Enter; due date, priority and class
// optional), one list with views (To do, Needs attention, Upcoming, Done, All), search and filters, and the
// sheets to view, edit, complete, reopen and delete. Today uses the same Quick Add and sheets.
// Status rules live in data/tasks.js.
import { store } from '../data/index.js';
import { TASK_PRIORITY } from '../data/schema.js';
import { VIEWS, DUE, isOverdue, isDueToday, viewCounts, filterTasks } from '../data/tasks.js';
import { relativeDay } from '../data/agenda.js';
import { iso, fromIso, fmtDay } from '../lib/dates.js';
import { ask, formSheet, fieldError } from '../lib/dialog.js';
import { toast } from '../lib/toast.js';
import { esc } from '../lib/dom.js';
import { ICONS } from '../lib/icons.js';
import { viewHead } from './placeholder.js';
import { when } from './assignments.js';

const PRIORITY_LABEL = Object.fromEntries(TASK_PRIORITY);
const DEFAULT_FILTERS = { view: 'open', query: '', classId: '', priority: '', due: '' };
const friendly = (k, msg) => (k === 'title' && msg === 'Required' ? 'Give the task a title' : k === 'classId' ? 'Choose a class, or No class' : msg);
const todayIso = () => iso(new Date());
const short = date => fmtDay(fromIso(date));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const sortedClasses = () => [...store.all('classes')].sort((a, b) => a.name.localeCompare(b.name));
let count = 0;

/** Status, warnings and priority, in words (color only helps). */
export function taskPills(t, today = todayIso()) {
  return [
    t.done ? '<span class="status s-taught">Done</span>' : '',
    isOverdue(t, today) ? '<span class="status s-late">Overdue</span>' : '',
    isDueToday(t, today) ? '<span class="status s-to-grade">Due today</span>' : '',
    t.priority === 'high' ? '<span class="status s-high">High priority</span>' : t.priority === 'low' ? '<span class="status">Low priority</span>' : '',
  ].filter(Boolean).join(' ');
}
const dueLine = (t, today) => (t.due ? (isOverdue(t, today) ? when('Was due', t.due, today) : when('Due', t.due, today)) : 'No due date');

let filters = { ...DEFAULT_FILTERS };
export function resetTaskFilters() { filters = { ...DEFAULT_FILTERS }; }
/** Opens Tasks showing one class's open tasks (from Classes). */
export function showTasksFor(classId) { filters = { ...DEFAULT_FILTERS, classId }; location.hash = '#/tasks'; }
/** Opens Tasks on one view (from Today). */
export function showTasksView(view) { filters = { ...DEFAULT_FILTERS, view }; location.hash = '#/tasks'; }

/* ---------- Quick Add ---------- */

/**
 * Draws Quick Add into `el`: a title and Enter saves a task. Due date, priority and class are folded away,
 * with their current values in the summary. `state` keeps what's typed across redraws (Today redraws often);
 * `due` is the starting due date ('' for none). Returns { refresh }, which updates the class list in place.
 */
export function quickAdd(el, { due = '', state = {} } = {}) {
  const n = ++count;
  const s = Object.assign({ title: '', due, priority: 'normal', classId: '', open: false }, state);
  Object.assign(state, s);
  let classes = sortedClasses();
  if (s.classId && !classes.some(c => c.id === s.classId)) s.classId = state.classId = '';
  el.innerHTML = `<form class="quick-add" novalidate data-qa>
    <div class="qa-row">
      <label class="sr" for="qaTitle${n}">New task</label>
      <input class="field-in" id="qaTitle${n}" name="title" maxlength="200" autocomplete="off" enterkeyhint="done"
        placeholder="Add a task…" aria-describedby="qaErr${n} qaSum${n}" value="${esc(s.title)}">
      <button class="btn primary" type="submit">Add</button>
    </div>
    <p class="field-error" id="qaErr${n}" data-err="title" role="alert" hidden></p>
    <details class="qa-more"${s.open ? ' open' : ''}><summary id="qaSum${n}"></summary>
      <div class="qa-opts">
        <label class="field"><span>Due <i>optional</i></span><input class="field-in" type="date" name="due" value="${esc(s.due)}"></label>
        <label class="field"><span>Priority</span><select class="field-in" name="priority">${TASK_PRIORITY.map(([v, l]) => `<option value="${v}"${v === s.priority ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Class <i>optional</i></span><select class="field-in" name="classId"><option value="">No class</option>${classes.map(c => `<option value="${esc(c.id)}"${c.id === s.classId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      </div>
    </details>
  </form>`;
  const form = el.querySelector('form');
  const summary = () => {
    const today = todayIso();
    const d = form.elements.due.value;
    const c = classes.find(x => x.id === form.elements.classId.value);
    form.querySelector('summary').textContent = `${d ? when('Due', d, today) : 'No due date'} · ${PRIORITY_LABEL[form.elements.priority.value]} priority · ${c ? c.name : 'No class'}`;
  };
  const err = form.querySelector('[data-err="title"]');
  const remember = () => Object.assign(state, {
    title: form.elements.title.value, due: form.elements.due.value, priority: form.elements.priority.value,
    classId: form.elements.classId.value, open: form.querySelector('details').open,
  });
  form.addEventListener('input', () => { remember(); summary(); if (form.elements.title.value.trim()) err.hidden = true; });
  form.addEventListener('change', () => { remember(); summary(); });
  form.querySelector('details').addEventListener('toggle', remember);
  form.addEventListener('submit', e => {
    e.preventDefault();
    const title = form.elements.title;
    const input = { title: title.value, due: form.elements.due.value || null, priority: form.elements.priority.value, classId: form.elements.classId.value || null };
    if (!title.value.trim()) { err.textContent = 'Type the task first.'; err.hidden = false; title.setAttribute('aria-invalid', 'true'); title.focus(); return; }
    // Cleared before saving: saving can redraw this form (Today does), and the redraw reads `state`.
    state.title = '';
    const res = store.create('tasks', input);
    if (!res.ok) {
      state.title = input.title;
      const { _: general, ...fields } = res.errors;
      err.textContent = general || Object.entries(fields).map(([k, m]) => friendly(k, m)).join(' ');
      err.hidden = false;
      title.focus();
      return;
    }
    if (form.isConnected) { title.value = ''; title.removeAttribute('aria-invalid'); err.hidden = true; title.focus(); }
    toast(`Added ${res.record.title}`, { label: 'Undo', fn: () => store.remove('tasks', res.record.id) });
  });
  summary();
  return {
    refresh() {
      classes = sortedClasses();
      const sel = form.elements.classId;
      const keep = classes.some(c => c.id === sel.value) ? sel.value : '';
      sel.innerHTML = `<option value="">No class</option>${classes.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}`;
      sel.value = keep;
      remember();
      summary();
    },
  };
}

/* ---------- The Tasks screen ---------- */

export function render(container) {
  container.innerHTML = `<section class="view lessons tasks">
    ${viewHead({ eyebrow: 'To do', title: 'Tasks', lede: 'Copies, emails, meetings, duties: everything else on your plate.' })}
    <div class="panel"><div class="panel-body" data-quick></div></div>
    <div data-top></div>
    <div data-results></div>
  </section>`;
  const el = container.querySelector('section.view');
  const quick = quickAdd(el.querySelector('[data-quick]'));

  const paintTop = (force = false) => {
    const classes = store.all('classes'), list = store.all('tasks'), today = todayIso();
    const top = el.querySelector('[data-top]');
    if (!list.length) { top.innerHTML = ''; return; }
    if (!top.querySelector('[data-f]')) {
      top.innerHTML = `<div class="views" role="group" aria-label="Show"></div>
      <div class="panel filters" role="search">
        <div class="filter-search">
          <label class="field grow"><span>Search</span><input class="field-in" type="search" data-f="query" placeholder="Title, notes, class…" autocomplete="off"></label>
          <button class="btn filter-toggle" type="button" data-act="toggle-filters" aria-expanded="false" aria-controls="moreTaskFilters">Filters</button>
        </div>
        <div class="filter-more" id="moreTaskFilters">
          <label class="field"><span>Due</span><select class="field-in" data-f="due">${DUE.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
          <label class="field"><span>Priority</span><select class="field-in" data-f="priority"><option value="">Any priority</option>${[...TASK_PRIORITY].reverse().map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
          <label class="field"><span>Class</span><select class="field-in" data-f="classId"></select></label>
        </div>
      </div>`;
    }
    const counts = viewCounts(list, today);
    top.querySelector('.views').innerHTML = VIEWS.map(([v, label]) => `<button class="view-btn" type="button" data-view="${v}" aria-pressed="${filters.view === v}">${label} <span class="count">${counts[v]}</span></button>`).join('');
    const missing = list.some(t => t.classId && !classes.some(c => c.id === t.classId));
    if (filters.classId && !['none', 'missing'].includes(filters.classId) && !classes.some(c => c.id === filters.classId)) filters.classId = '';
    top.querySelector('[data-f="classId"]').innerHTML = `<option value="">All tasks</option><option value="none">No class</option>${[...classes].sort((a, b) => a.name.localeCompare(b.name)).map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}${missing ? '<option value="missing">Missing class</option>' : ''}`;
    for (const input of top.querySelectorAll('[data-f]')) if (force || input !== document.activeElement) input.value = filters[input.dataset.f];
    paintToggle();
  };
  const paintToggle = () => {
    const b = el.querySelector('[data-act="toggle-filters"]');
    if (!b) return;
    const n = ['classId', 'priority', 'due'].filter(k => filters[k]).length;
    b.textContent = n ? `Filters (${n})` : 'Filters';
  };

  const paintResults = () => {
    const classes = store.all('classes'), list = store.all('tasks'), today = todayIso();
    const out = el.querySelector('[data-results]');
    if (!list.length) {
      out.innerHTML = `<div class="panel empty"><div class="empty-icon">${ICONS.tasks}</div><h2>No tasks yet</h2>
        <p>Type a task above and press Enter. Add a due date, a priority or a class if it helps; none of them are needed.</p></div>`;
      return;
    }
    const shown = filterTasks(list, classes, filters, today);
    const narrowed = ['query', 'classId', 'priority', 'due'].some(k => filters[k]);
    const byId = new Map(classes.map(c => [c.id, c]));
    const head = `<div class="results-head"><p class="note" tabindex="-1" aria-live="polite">${esc(Object.fromEntries(VIEWS)[filters.view])}: ${plural(shown.length, 'task', 'tasks')}</p>
      ${narrowed ? '<button class="btn" type="button" data-act="clear">Clear filters</button>' : ''}</div>`;
    if (!shown.length) {
      const msg = narrowed ? `No tasks match${filters.query ? ` “${esc(filters.query)}”` : ''}.`
        : { open: 'Nothing to do. Nice.', attention: 'Nothing overdue or due today.', upcoming: 'Nothing due after today.', done: 'Nothing done yet.', all: 'No tasks.' }[filters.view];
      out.innerHTML = `${head}<div class="panel"><div class="panel-body stack"><p class="note">${msg}</p>
        ${narrowed ? '<div class="row-btns"><button class="btn" type="button" data-act="clear">Clear filters</button></div>' : ''}</div></div>`;
      return;
    }
    out.innerHTML = `${head}<ul class="lesson-list">${shown.map(t => item(t, byId.get(t.classId), today)).join('')}</ul>`;
  };

  const paint = (force = false) => { paintTop(force); paintResults(); };

  el.addEventListener('input', e => {
    const f = e.target.dataset.f;
    if (!f) return;
    filters = { ...filters, [f]: e.target.value };
    paintToggle();
    paintResults();
  });
  el.addEventListener('change', e => {
    if (e.target.dataset.act === 'toggle') toggleDone(e.target.dataset.id, e.target.checked);
  });
  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const { act, id } = b.dataset;
    if (b.dataset.view) { filters = { ...filters, view: b.dataset.view }; paintTop(); paintResults(); el.querySelector(`[data-view="${b.dataset.view}"]`)?.focus(); }
    else if (act === 'toggle-filters') {
      const open = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', String(open));
      el.querySelector('.filters').classList.toggle('open', open);
    }
    else if (act === 'clear') { filters = { ...DEFAULT_FILTERS, view: filters.view }; paint(true); el.querySelector('[data-f="query"]')?.focus(); }
    else if (act === 'open') openTask(id);
    else if (act === 'edit') { const t = store.get('tasks', id); if (t) taskForm({ prev: t }); }
    else if (act === 'delete') deleteTask(id);
  });

  const off = store.subscribe(() => {
    if (!el.isConnected) { off(); return; }
    quick.refresh();
    // Completing from the keyboard: keep focus on that task's checkbox, or, when it left the list (done tasks
    // leave To do), on the checkbox now in its place, so focus never falls back to the top of the page.
    const f = document.activeElement;
    const boxes = () => [...el.querySelectorAll('[data-act="toggle"]')];
    const at = f && el.contains(f) && f.dataset.act === 'toggle' ? { id: f.dataset.id, index: boxes().indexOf(f) } : null;
    paint();
    if (at) {
      const now = boxes();
      (now.find(b => b.dataset.id === at.id) || now[Math.min(at.index, now.length - 1)] || el.querySelector('.results-head .note') || el.querySelector('h1')).focus();
    }
  });
  paint();
}

function item(t, c, today) {
  const sub = [t.classId ? (c ? c.name : 'Missing class') : '', dueLine(t, today), t.description.split('\n')[0]].filter(Boolean).join(' · ');
  return `<li class="lesson-item task-item${t.done ? ' is-done' : ''}${isOverdue(t, today) ? ' is-urgent' : ''}" style="--c: var(--${c ? esc(c.color) : 'line'})">
    <label class="task-check"><input type="checkbox" data-act="toggle" data-id="${esc(t.id)}"${t.done ? ' checked' : ''}><span class="sr">${t.done ? 'Done' : 'Not done'}: ${esc(t.title)}</span></label>
    <button class="lesson-open" type="button" data-act="open" data-id="${esc(t.id)}">
      <b>${esc(t.title)}</b> ${taskPills(t, today)}
      <span class="lesson-sub">${esc(sub)}</span>
    </button>
    <div class="row-btns">
      <button class="btn" type="button" data-act="edit" data-id="${esc(t.id)}" aria-label="Edit ${esc(t.title)}">Edit</button>
      <button class="btn danger" type="button" data-act="delete" data-id="${esc(t.id)}" aria-label="Delete ${esc(t.title)}">Delete</button>
    </div>
  </li>`;
}

/* ---------- Done, view, delete ---------- */

/** Completes or reopens a task, with Undo. Reopening brings back whatever its due date says (overdue or not). */
export function toggleDone(id, done) {
  const t = store.get('tasks', id);
  if (!t || t.done === done) return;
  const res = store.update('tasks', id, { done });
  if (!res.ok) { toast(res.errors._ || 'Couldn’t save that change.'); return; }
  toast(done ? `Done: ${t.title}` : `Reopened ${t.title}`, { label: 'Undo', fn: () => store.update('tasks', id, { done: t.done }) });
}

/** Shows a task to read, with Done or Reopen, Edit and Delete. Also used by Today. */
export async function openTask(id) {
  const t = store.get('tasks', id);
  if (!t) return;
  const c = t.classId ? store.get('classes', t.classId) : null;
  const today = todayIso();
  const choice = await ask({
    title: t.title,
    cls: 'lesson-sheet',
    cancel: 'Close',
    body: `<p class="lv-meta">${taskPills(t, today) || '<span class="status">To do</span>'} <span>${esc(t.classId ? (c ? c.name : 'Missing class') : 'No class')}</span></p>
      <p class="mono">${esc(dueLine(t, today))}${t.due && t.due.slice(0, 4) !== today.slice(0, 4) ? `, ${t.due.slice(0, 4)}` : ''}</p>
      ${t.done && t.doneAt ? `<p class="hint">Done ${esc(fmtDay(new Date(t.doneAt)))}</p>` : ''}
      ${t.description ? `<h3>Notes</h3><p class="pre">${esc(t.description)}</p>` : ''}`,
    actions: [
      { label: 'Delete', value: 'delete', danger: true },
      { label: 'Edit', value: 'edit' },
      t.done ? { label: 'Reopen', value: 'reopen', primary: true } : { label: 'Mark done', value: 'done', primary: true },
    ],
  });
  if (choice === 'edit') { const cur = store.get('tasks', id); if (cur) taskForm({ prev: cur }); }
  else if (choice === 'delete') deleteTask(id);
  else if (choice === 'done' || choice === 'reopen') toggleDone(id, choice === 'done');
}

/** Asks first; removes only this task; offers Undo. */
export async function deleteTask(id) {
  const t = store.get('tasks', id);
  if (!t) return;
  const choice = await ask({
    title: `Delete “${t.title}”?`,
    body: '<p>Only this task is removed.</p>',
    actions: [{ label: 'Delete task', value: 'delete', primary: true, danger: true }],
  });
  if (choice !== 'delete') return;
  const res = store.remove('tasks', id);
  if (!res.ok) { toast(res.errors._); return; }
  toast(`Deleted ${t.title}`, { label: 'Undo', fn: () => { const r = store.restoreRemoved(res.removed); if (!r.ok) toast(r.errors._); } });
}

/* ---------- Full form ---------- */

/** The full task form, for editing (or a new task with every field). */
export function taskForm({ prev = null, initial = {} } = {}) {
  const v = { title: '', description: '', due: '', priority: 'normal', classId: '', done: false, ...initial, ...(prev || {}) };
  const classes = sortedClasses();
  const missing = v.classId && !classes.some(c => c.id === v.classId);
  const body = `
    <label class="field"><span>Task</span>
      <input class="field-in" name="title" maxlength="200" required autocomplete="off" value="${esc(v.title)}">
      <small class="field-error" data-err="title" hidden></small></label>
    <div class="field-pair">
      <label class="field"><span>Due <i>optional</i></span>
        <input class="field-in" type="date" name="due" value="${esc(v.due || '')}">
        <small class="field-error" data-err="due" hidden></small></label>
      <label class="field"><span>Class <i>optional</i></span>
        <select class="field-in" name="classId">
          ${missing ? '<option value="" selected disabled>Missing class: choose one</option>' : ''}
          <option value=""${!v.classId ? ' selected' : ''}>No class</option>
          ${classes.map(c => `<option value="${esc(c.id)}"${c.id === v.classId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
        <small class="field-error" data-err="classId" hidden></small></label>
    </div>
    <fieldset class="field"><legend>Priority</legend>
      <div class="pick-row">${TASK_PRIORITY.map(([k, label]) => `<label class="pick"><input type="radio" name="priority" value="${k}"${v.priority === k ? ' checked' : ''}><span>${label}</span></label>`).join('')}</div>
    </fieldset>
    <label class="field"><span>Notes <i>optional</i></span>
      <textarea class="field-in" name="description" rows="3" placeholder="Details, links, who to ask">${esc(v.description)}</textarea>
      <small class="field-error" data-err="description" hidden></small></label>
    ${prev ? `<label class="check-line"><input type="checkbox" name="done"${v.done ? ' checked' : ''}> <span>Done</span></label>` : ''}`;
  return formSheet({
    title: prev ? 'Edit task' : 'New task',
    submit: prev ? 'Save changes' : 'Save task',
    body,
    onSubmit(form) {
      for (const k of ['title', 'due', 'classId', 'description']) fieldError(form, k, '');
      const formError = form.querySelector('.form-error');
      formError.hidden = true;
      const input = {
        title: form.elements.title.value, description: form.elements.description.value, due: form.elements.due.value || null,
        classId: form.elements.classId.value || (missing && form.elements.classId.selectedIndex === 0 ? v.classId : null),
        priority: form.querySelector('input[name="priority"]:checked')?.value || 'normal',
        ...(prev ? { done: form.elements.done.checked } : {}),
      };
      const res = prev ? store.update('tasks', prev.id, input) : store.create('tasks', input);
      if (!res.ok) {
        const { _: general, ...fields } = res.errors;
        for (const [k, msg] of Object.entries(fields)) fieldError(form, k, friendly(k, msg));
        if (general) { formError.textContent = general; formError.hidden = false; }
        form.querySelector('[aria-invalid="true"]')?.focus();
        return false;
      }
      toast(prev ? 'Task saved' : `Added ${res.record.title}`);
      return true;
    },
  });
}
