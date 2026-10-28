// Assignments: what's been given out, when it's due, and the grading that follows. One list with views
// (Needs attention, Upcoming, Graded, All), search and filters, and the sheets to view, write, move through
// the grading steps, and delete. Today and Classes open the same sheets. Status rules live in data/assignments.js.
import { store } from '../data/index.js';
import { ASSIGNMENT_STATUS } from '../data/schema.js';
import { relativeDay } from '../data/agenda.js';
import { VIEWS, DUE, NEXT_STEP, DONE, isLate, isPastDue, viewCounts, filterAssignments } from '../data/assignments.js';
import { iso, fromIso, addDays, fmtDay } from '../lib/dates.js';
import { isIsoDate } from '../data/fields.js';
import { ask, formSheet, fieldError } from '../lib/dialog.js';
import { toast } from '../lib/toast.js';
import { esc } from '../lib/dom.js';
import { ICONS } from '../lib/icons.js';
import { viewHead } from './placeholder.js';
import { classForm } from './classes.js';

const STATUS_LABEL = Object.fromEntries(ASSIGNMENT_STATUS);
const STATUS_HINT = {
  assigned: 'Given out, not collected yet.',
  'to-grade': 'Collected and waiting to be graded.',
  graded: 'Graded, not handed back yet.',
  returned: 'Graded and handed back.',
};
const DEFAULT_FILTERS = { view: 'attention', query: '', classId: '', status: '', due: '' };
const REQUIRED = { title: 'Give the assignment a title' };
const friendly = (k, msg) => (k === 'classId' ? 'Choose a class' : msg === 'Required' && REQUIRED[k]) || msg;
const short = date => fmtDay(fromIso(date));
const todayIso = () => iso(new Date());
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const pill = s => `<span class="status s-${esc(s)}">${esc(STATUS_LABEL[s])}</span>`;

/** Status and warning pills: the words carry the meaning, color only helps. */
export function statusPills(a, today = todayIso()) {
  return `${pill(a.status)}${isLate(a, today) ? ' <span class="status s-late">Late</span>' : ''}${isPastDue(a, today) ? ' <span class="status s-late">Past due</span>' : ''}`;
}

/** "Due Mon, Nov 23 (in 3 days)", "Due today", "Grade by Fri, Nov 20 (3 days ago)". */
function when(label, date, today) {
  const rel = relativeDay(date, today);
  return ['Today', 'Tomorrow', 'Yesterday'].includes(rel) ? `${label} ${rel.toLowerCase()}` : `${label} ${short(date)} (${rel.toLowerCase()})`;
}
export function dateLine(a, today = todayIso()) {
  return [
    a.due ? when('Due', a.due, today) : 'No due date',
    a.gradeBy && !DONE.has(a.status) ? when('Grade by', a.gradeBy, today) : '',
  ].filter(Boolean).join(' · ');
}

let filters = { ...DEFAULT_FILTERS };
export function resetAssignmentFilters() { filters = { ...DEFAULT_FILTERS }; }
/** Opens Assignments showing one class's assignments (from Classes). */
export function showAssignmentsFor(classId) { filters = { ...DEFAULT_FILTERS, classId, view: 'all' }; location.hash = '#/assignments'; }
/** Opens Assignments on one view (from Today). */
export function showAssignmentsView(view) { filters = { ...DEFAULT_FILTERS, view }; location.hash = '#/assignments'; }

export function render(container) {
  container.innerHTML = `<section class="view lessons assignments">
    ${viewHead({ eyebrow: 'Grading', title: 'Assignments', lede: 'What’s due, what’s waiting to be graded and what’s been handed back.' })}
    <div data-top></div>
    <div data-results></div>
  </section>`;
  const el = container.querySelector('section.view');

  const paintTop = (force = false) => {
    const classes = store.all('classes'), list = store.all('assignments'), today = todayIso();
    const top = el.querySelector('[data-top]');
    if (!list.length) { top.innerHTML = ''; return; }
    if (!top.querySelector('[data-f]')) {
      top.innerHTML = `<div class="lessons-bar"><button class="btn primary" type="button" data-act="new">New assignment</button></div>
      <div class="views" role="group" aria-label="Show"></div>
      <div class="panel filters" role="search">
        <div class="filter-search">
          <label class="field grow"><span>Search</span><input class="field-in" type="search" data-f="query" placeholder="Title, instructions, notes…" autocomplete="off"></label>
          <button class="btn filter-toggle" type="button" data-act="toggle-filters" aria-expanded="false" aria-controls="moreAsgFilters">Filters</button>
        </div>
        <div class="filter-more" id="moreAsgFilters">
          <label class="field"><span>Class</span><select class="field-in" data-f="classId"></select></label>
          <label class="field"><span>Status</span><select class="field-in" data-f="status"><option value="">Any status</option>${ASSIGNMENT_STATUS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
          <label class="field"><span>Due</span><select class="field-in" data-f="due">${DUE.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
        </div>
      </div>`;
    }
    const counts = viewCounts(list, today);
    top.querySelector('.views').innerHTML = VIEWS.map(([v, label]) => `<button class="view-btn" type="button" data-view="${v}" aria-pressed="${filters.view === v}">${label} <span class="count">${counts[v]}</span></button>`).join('');
    const missing = list.some(a => !classes.some(c => c.id === a.classId));
    if (filters.classId && filters.classId !== 'missing' && !classes.some(c => c.id === filters.classId)) filters.classId = '';
    top.querySelector('[data-f="classId"]').innerHTML = `<option value="">All classes</option>${[...classes].sort((a, b) => a.name.localeCompare(b.name)).map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}${missing ? '<option value="missing">Missing class</option>' : ''}`;
    for (const input of top.querySelectorAll('[data-f]')) if (force || input !== document.activeElement) input.value = filters[input.dataset.f];
    paintToggle();
  };
  const paintToggle = () => {
    const b = el.querySelector('[data-act="toggle-filters"]');
    if (!b) return;
    const n = ['classId', 'status', 'due'].filter(k => filters[k]).length;
    b.textContent = n ? `Filters (${n})` : 'Filters';
  };

  const paintResults = () => {
    const classes = store.all('classes'), list = store.all('assignments'), today = todayIso();
    const out = el.querySelector('[data-results]');
    if (!list.length) {
      out.innerHTML = classes.length
        ? `<div class="panel empty"><div class="empty-icon">${ICONS.assignments}</div><h2>No assignments yet</h2>
            <p>Add what you give out with its due date. TeacherSync suggests a grading deadline, and Today shows what’s waiting to be graded. No student names or scores are stored.</p>
            <button class="btn primary" type="button" data-act="new">Add your first assignment</button></div>`
        : `<div class="panel empty"><div class="empty-icon">${ICONS.assignments}</div><h2>Add a class first</h2>
            <p>Each assignment belongs to a class. Add the classes you teach, then their assignments.</p>
            <button class="btn primary" type="button" data-act="add-class">Add a class</button></div>`;
      return;
    }
    const shown = filterAssignments(list, classes, filters, today);
    const narrowed = ['query', 'classId', 'status', 'due'].some(k => filters[k]);
    const byId = new Map(classes.map(c => [c.id, c]));
    const viewLabel = Object.fromEntries(VIEWS)[filters.view];
    const head = `<div class="results-head"><p class="note" aria-live="polite">${esc(viewLabel)}: ${plural(shown.length, 'assignment', 'assignments')}</p>
      ${narrowed ? '<button class="btn" type="button" data-act="clear">Clear filters</button>' : ''}</div>`;
    if (!shown.length) {
      const msg = narrowed ? `No assignments match${filters.query ? ` “${esc(filters.query)}”` : ''}.`
        : { attention: 'Nothing needs attention: nothing past due or waiting to be graded.', upcoming: 'Nothing coming up.', done: 'Nothing graded yet.', all: 'No assignments.' }[filters.view];
      out.innerHTML = `${head}<div class="panel"><div class="panel-body stack"><p class="note">${msg}</p>
        ${narrowed ? '<div class="row-btns"><button class="btn" type="button" data-act="clear">Clear filters</button></div>' : ''}</div></div>`;
      return;
    }
    out.innerHTML = `${head}<ul class="lesson-list">${shown.map(a => item(a, byId.get(a.classId), today)).join('')}</ul>`;
  };

  const paint = (force = false) => { paintTop(force); paintResults(); };

  el.addEventListener('input', e => {
    const f = e.target.dataset.f;
    if (!f) return;
    filters = { ...filters, [f]: e.target.value };
    paintToggle();
    paintResults();
  });
  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const { act, id } = b.dataset;
    if (b.dataset.view) { filters = { ...filters, view: b.dataset.view }; paintTop(); paintResults(); el.querySelector(`[data-view="${b.dataset.view}"]`)?.focus(); }
    else if (act === 'new') assignmentForm({ initial: filters.classId && filters.classId !== 'missing' ? { classId: filters.classId } : {} });
    else if (act === 'add-class') classForm();
    else if (act === 'toggle-filters') {
      const open = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', String(open));
      el.querySelector('.filters').classList.toggle('open', open);
    }
    else if (act === 'clear') { filters = { ...DEFAULT_FILTERS, view: filters.view }; paint(true); el.querySelector('[data-f="query"]')?.focus(); }
    else if (act === 'open') openAssignment(id);
    else if (act === 'step') setStatus(id, b.dataset.to);
    else if (act === 'edit') { const a = store.get('assignments', id); if (a) assignmentForm({ prev: a }); }
    else if (act === 'delete') deleteAssignment(id);
  });

  const off = store.subscribe(() => { if (!el.isConnected) off(); else paint(); });
  paint();
}

function item(a, c, today) {
  const step = NEXT_STEP[a.status];
  return `<li class="lesson-item asg-item${isLate(a, today) || isPastDue(a, today) ? ' is-urgent' : ''}" style="--c: var(--${esc(c ? c.color : 's1')})">
    <button class="lesson-open" type="button" data-act="open" data-id="${esc(a.id)}">
      <b>${esc(a.title)}</b> ${statusPills(a, today)}
      <span class="lesson-sub">${esc(c ? c.name : 'Missing class')} · <span class="mono">${esc(dateLine(a, today))}</span></span>
    </button>
    <div class="row-btns">
      ${step ? `<button class="btn" type="button" data-act="step" data-id="${esc(a.id)}" data-to="${step[0]}" aria-label="${esc(step[1])}: ${esc(a.title)}">${esc(step[1])}</button>` : ''}
      <button class="btn" type="button" data-act="edit" data-id="${esc(a.id)}" aria-label="Edit ${esc(a.title)}">Edit</button>
      <button class="btn danger" type="button" data-act="delete" data-id="${esc(a.id)}" aria-label="Delete ${esc(a.title)}">Delete</button>
    </div>
  </li>`;
}

/* ---------- Status ---------- */

/** Moves an assignment to another status, with Undo. */
export function setStatus(id, status) {
  const a = store.get('assignments', id);
  if (!a || a.status === status) return;
  const res = store.update('assignments', id, { status });
  if (!res.ok) { toast(res.errors._ || Object.values(res.errors)[0]); return; }
  toast(`${a.title}: ${STATUS_LABEL[status]}`, { label: 'Undo', fn: () => store.update('assignments', id, { status: a.status }) });
}

/* ---------- View ---------- */

/** Shows an assignment to read, with its next grading step, Edit and Delete. Also used by Today. */
export async function openAssignment(id) {
  const a = store.get('assignments', id);
  if (!a) return;
  const c = store.get('classes', a.classId);
  const today = todayIso();
  const dates = [['Assigned', a.assigned], ['Due', a.due], ['Grade by', a.gradeBy]].filter(([, d]) => d)
    .map(([label, d]) => `<div><dt>${label}</dt><dd class="mono">${esc(short(d))}${d.slice(0, 4) !== today.slice(0, 4) ? `, ${d.slice(0, 4)}` : ''} <span class="muted">(${esc(relativeDay(d, today).toLowerCase())})</span></dd></div>`).join('');
  const step = NEXT_STEP[a.status];
  // Grading can be reopened: back to To grade from Graded or Returned, back to Assigned from To grade.
  const back = DONE.has(a.status) ? ['to-grade', 'Back to To grade'] : a.status === 'to-grade' ? ['assigned', 'Back to Assigned'] : null;
  const choice = await ask({
    title: a.title,
    cls: 'lesson-sheet',
    cancel: 'Close',
    body: `<p class="lv-meta">${statusPills(a, today)} <span>${esc(c ? c.name : 'Missing class')}</span></p>
      <p class="hint">${esc(STATUS_HINT[a.status])}</p>
      ${dates ? `<dl class="asg-dates">${dates}</dl>` : '<p class="note">No dates set.</p>'}
      ${a.description ? `<h3>Instructions</h3><p class="pre">${esc(a.description)}</p>` : ''}
      ${a.notes ? `<h3>Notes</h3><p class="pre">${esc(a.notes)}</p>` : ''}`,
    actions: [
      { label: 'Delete', value: 'delete', danger: true },
      { label: 'Edit', value: 'edit' },
      ...(back ? [{ label: back[1], value: `to:${back[0]}` }] : []),
      ...(step ? [{ label: step[1], value: `to:${step[0]}`, primary: true }] : []),
    ],
  });
  if (choice === 'edit') { const cur = store.get('assignments', id); if (cur) assignmentForm({ prev: cur }); }
  else if (choice === 'delete') deleteAssignment(id);
  else if (choice && choice.startsWith('to:')) setStatus(id, choice.slice(3));
}

/** Asks first; removes only this assignment (never its class, lesson plans or tasks); offers Undo. */
export async function deleteAssignment(id) {
  const a = store.get('assignments', id);
  if (!a) return;
  const choice = await ask({
    title: `Delete “${a.title}”?`,
    body: '<p>Only this assignment is removed. Its class, lesson plans and everything else stay.</p>',
    actions: [{ label: 'Delete assignment', value: 'delete', primary: true, danger: true }],
  });
  if (choice !== 'delete') return;
  const res = store.remove('assignments', id);
  if (!res.ok) { toast(res.errors._); return; }
  toast(`Deleted ${a.title}`, { label: 'Undo', fn: () => { const r = store.restoreRemoved(res.removed); if (!r.ok) toast(r.errors._); } });
}

/* ---------- Form ---------- */

/**
 * The assignment form. `prev` edits one; otherwise a new one starts from `initial` (a class or assigned date
 * from Today or Classes). The grading deadline follows the due date (plus the days in Settings) until it's changed.
 */
export function assignmentForm({ prev = null, initial = {} } = {}) {
  const gradingDays = store.settings().gradingDays;
  const auto = due => (isIsoDate(due) ? iso(addDays(fromIso(due), gradingDays)) : '');
  const v = { title: '', classId: '', assigned: prev ? '' : todayIso(), due: '', gradeBy: '', status: 'assigned', description: '', notes: '', ...initial, ...(prev || {}) };
  const classes = [...store.all('classes')].sort((a, b) => a.name.localeCompare(b.name));
  const known = classes.some(c => c.id === v.classId);
  // Still following the due date: a new assignment, or one whose deadline is the default.
  let followDue = !prev || !v.gradeBy || v.gradeBy === auto(v.due);
  const autoHint = `Set to ${plural(gradingDays, 'day', 'days')} after the due date (Settings). Change it if you like.`;
  const body = `
    <label class="field"><span>Title</span>
      <input class="field-in" name="title" maxlength="120" required autocomplete="off" placeholder="Lab report: density" value="${esc(v.title)}">
      <small class="field-error" data-err="title" hidden></small></label>
    <label class="field"><span>Class</span>
      <select class="field-in" name="classId" required>
        ${known ? '' : `<option value="" selected disabled>${v.classId ? 'Missing class: choose one' : 'Choose a class'}</option>`}
        ${classes.map(c => `<option value="${esc(c.id)}"${c.id === v.classId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select>
      <small class="field-error" data-err="classId" hidden></small></label>
    <div class="field-trio">
      <label class="field"><span>Assigned <i>optional</i></span>
        <input class="field-in" type="date" name="assigned" value="${esc(v.assigned || '')}">
        <small class="field-error" data-err="assigned" hidden></small></label>
      <label class="field"><span>Due <i>optional</i></span>
        <input class="field-in" type="date" name="due" value="${esc(v.due || '')}">
        <small class="field-error" data-err="due" hidden></small></label>
      <label class="field"><span>Grade by <i>optional</i></span>
        <input class="field-in" type="date" name="gradeBy" value="${esc(v.gradeBy || '')}">
        <small class="field-error" data-err="gradeBy" hidden></small></label>
    </div>
    <p class="hint" data-grade-hint>${followDue && v.due ? esc(autoHint) : 'The grading deadline is when you want it graded by. Today flags it as late after that.'}</p>
    <fieldset class="field"><legend>Status</legend>
      <div class="pick-row four">${ASSIGNMENT_STATUS.map(([k, label]) => `<label class="pick"><input type="radio" name="status" value="${k}"${v.status === k ? ' checked' : ''}><span>${label}</span></label>`).join('')}</div>
      <p class="hint" data-status-hint>${esc(STATUS_HINT[v.status])}</p>
    </fieldset>
    <label class="field"><span>Instructions <i>optional</i></span>
      <textarea class="field-in" name="description" rows="3" placeholder="What students need to do">${esc(v.description)}</textarea>
      <small class="field-error" data-err="description" hidden></small></label>
    <label class="field"><span>Notes <i>optional</i></span>
      <textarea class="field-in" name="notes" rows="2" placeholder="Rubric, where the papers are, reminders">${esc(v.notes)}</textarea>
      <small class="field-error" data-err="notes" hidden></small></label>
    <p class="hint">For the whole class. Don’t add student names, grades or other student information.</p>`;

  const sheet = formSheet({
    title: prev ? 'Edit assignment' : 'New assignment',
    submit: prev ? 'Save changes' : 'Save assignment',
    body,
    onSubmit(form) {
      const names = ['title', 'classId', 'assigned', 'due', 'gradeBy', 'description', 'notes'];
      for (const k of names) fieldError(form, k, '');
      const formError = form.querySelector('.form-error');
      formError.hidden = true;
      const input = Object.fromEntries(names.map(k => [k, form.elements[k].value]));
      for (const k of ['assigned', 'due', 'gradeBy']) input[k] = input[k] || null;
      input.status = form.querySelector('input[name="status"]:checked')?.value || 'assigned';
      const res = prev ? store.update('assignments', prev.id, input) : store.create('assignments', input);
      if (!res.ok) {
        const { _: general, ...fields } = res.errors;
        for (const [k, msg] of Object.entries(fields)) fieldError(form, k, friendly(k, msg));
        if (general) { formError.textContent = general; formError.hidden = false; }
        form.querySelector('[aria-invalid="true"]')?.focus();
        return false;
      }
      toast(prev ? 'Assignment saved' : `Saved ${res.record.title}`);
      return true;
    },
  });

  const form = sheet.el.querySelector('form');
  form.addEventListener('change', e => {
    const hint = form.querySelector('[data-grade-hint]');
    if (e.target.name === 'status') form.querySelector('[data-status-hint]').textContent = STATUS_HINT[e.target.value];
    if (e.target.name === 'gradeBy') { followDue = false; hint.textContent = 'The grading deadline is when you want it graded by. Today flags it as late after that.'; }
    if (e.target.name === 'due' && followDue) {
      form.elements.gradeBy.value = auto(e.target.value);
      hint.textContent = e.target.value ? autoHint : '';
    }
  });
  return sheet;
}
