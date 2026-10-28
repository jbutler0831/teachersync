// Lesson plans: the list (search and filters, grouped by date), and the sheets to view, write, duplicate and
// delete a plan. Today and Classes open the same sheets, so there is one way to edit a plan everywhere.
import { store } from '../data/index.js';
import { LESSON_STATUS } from '../data/schema.js';
import { meetingsOn, dayOffOn } from '../data/schedule.js';
import { relativeDay } from '../data/agenda.js';
import { WHEN, filterLessons, groupByDate, nextMeetingDates, copyOf } from '../data/lessons.js';
import { iso, fromIso, fmtDay, fmtLongDate, fmtTime, WEEKDAYS } from '../lib/dates.js';
import { ask, formSheet, fieldError } from '../lib/dialog.js';
import { toast } from '../lib/toast.js';
import { esc } from '../lib/dom.js';
import { ICONS } from '../lib/icons.js';
import { viewHead } from './placeholder.js';
import { classForm } from './classes.js';

const STATUS_LABEL = Object.fromEntries(LESSON_STATUS);
const STATUS_HINT = { draft: 'Still being prepared.', ready: 'Ready to teach on its date.', taught: 'Already taught. Kept so you can reuse it.' };
const FIELDS = [
  ['objectives', 'Objectives', 3, 'Students will be able to…'],
  ['activities', 'Lesson & activities', 5, 'Warm-up, instruction, practice, steps…'],
  ['materials', 'Materials & resources', 2, 'Handouts, slides, links, supplies'],
  ['assessment', 'Closing & assessment', 2, 'Exit ticket, check for understanding'],
  ['notes', 'Notes', 2, 'Anything else to remember'],
];
const DEFAULT_FILTERS = { query: '', classId: '', status: '', when: 'upcoming', day: '' };
const REQUIRED = { title: 'Give the lesson a title', classId: 'Choose a class' };
const friendly = (k, msg) => (k === 'classId' ? REQUIRED.classId : msg === 'Required' && REQUIRED[k]) || msg;
const short = date => fmtDay(fromIso(date));
const todayIso = () => iso(new Date());
const statusPill = s => `<span class="status s-${esc(s)}">${esc(STATUS_LABEL[s])}</span>`;

// Filters last while the app is open, so going back to Lesson plans finds the same list.
let filters = { ...DEFAULT_FILTERS };

/** Back to the default filters (tests start from here). */
export function resetLessonFilters() { filters = { ...DEFAULT_FILTERS }; }

/** Opens Lesson plans showing one class's plans (from Classes). */
export function showLessonsFor(classId) {
  filters = { ...DEFAULT_FILTERS, classId, when: 'all' };
  location.hash = '#/lessons';
}

/** "Today · Wed, Oct 28", "Fri, Dec 4", "Fri, Jan 1, 2027". */
function dayHeading(date, today) {
  const rel = relativeDay(date, today);
  const d = short(date) + (date.slice(0, 4) !== today.slice(0, 4) ? `, ${date.slice(0, 4)}` : '');
  return ['Today', 'Tomorrow', 'Yesterday'].includes(rel) ? `${rel} · ${d}` : d;
}

export function render(container) {
  container.innerHTML = `<section class="view lessons">
    ${viewHead({ eyebrow: 'Planning', title: 'Lesson plans', lede: 'Plan what you’re teaching each class, each day, and reuse what worked.' })}
    <div data-top></div>
    <div data-results></div>
  </section>`;
  const el = container.querySelector('section.view');

  // The search box and filters are drawn once (so typing keeps focus); the class list in them and the results redraw.
  // `force` also refills the field being typed in (after Clear filters).
  const paintTop = (force = false) => {
    const classes = store.all('classes'), lessons = store.all('lessons');
    const top = el.querySelector('[data-top]');
    if (!lessons.length) { top.innerHTML = ''; return; }
    if (!top.querySelector('[data-f]')) {
      top.innerHTML = `<div class="lessons-bar">
        <button class="btn primary" type="button" data-act="new">New lesson plan</button>
      </div>
      <div class="panel filters" role="search">
        <div class="filter-search">
          <label class="field grow"><span>Search</span><input class="field-in" type="search" data-f="query" placeholder="Title, objectives, materials…" autocomplete="off"></label>
          <button class="btn filter-toggle" type="button" data-act="toggle-filters" aria-expanded="false" aria-controls="moreFilters">Filters</button>
        </div>
        <div class="filter-more" id="moreFilters">
          <label class="field"><span>Class</span><select class="field-in" data-f="classId"></select></label>
          <label class="field"><span>Status</span><select class="field-in" data-f="status"><option value="">Any status</option>${LESSON_STATUS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
          <label class="field"><span>When</span><select class="field-in" data-f="when">${WHEN.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
          <label class="field" data-day-field><span>Date</span><input class="field-in" type="date" data-f="day"></label>
        </div>
      </div>`;
    }
    const missing = lessons.some(l => !classes.some(c => c.id === l.classId));
    if (filters.classId && filters.classId !== 'missing' && !classes.some(c => c.id === filters.classId)) filters.classId = '';
    top.querySelector('[data-f="classId"]').innerHTML = `<option value="">All classes</option>${[...classes].sort((a, b) => a.name.localeCompare(b.name)).map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}${missing ? '<option value="missing">Missing class</option>' : ''}`;
    for (const input of top.querySelectorAll('[data-f]')) if (force || input !== document.activeElement) input.value = filters[input.dataset.f];
    top.querySelector('[data-day-field]').hidden = filters.when !== 'day';
    paintToggle();
  };
  // On phones the class, status and date filters fold away behind a button that shows how many are set.
  const paintToggle = () => {
    const b = el.querySelector('[data-act="toggle-filters"]');
    if (!b) return;
    const n = ['classId', 'status'].filter(k => filters[k]).length + (filters.when !== DEFAULT_FILTERS.when ? 1 : 0);
    b.textContent = n ? `Filters (${n})` : 'Filters';
  };

  const paintResults = () => {
    const classes = store.all('classes'), lessons = store.all('lessons'), today = todayIso();
    const out = el.querySelector('[data-results]');
    if (!lessons.length) {
      out.innerHTML = classes.length
        ? `<div class="panel empty"><div class="empty-icon">${ICONS.lessons}</div><h2>No lesson plans yet</h2>
            <p>Write a plan for any class and day: objectives, activities, materials and how you’ll close. Mark it Planned when it’s ready, and reuse it next time.</p>
            <button class="btn primary" type="button" data-act="new">Plan your first lesson</button></div>`
        : `<div class="panel empty"><div class="empty-icon">${ICONS.lessons}</div><h2>Add a class first</h2>
            <p>Each lesson plan belongs to a class. Add the classes you teach, then plan lessons for them.</p>
            <button class="btn primary" type="button" data-act="add-class">Add a class</button></div>`;
      return;
    }
    const shown = filterLessons(lessons, classes, filters, today);
    const active = JSON.stringify({ ...filters }) !== JSON.stringify(DEFAULT_FILTERS);
    const byId = new Map(classes.map(c => [c.id, c]));
    const head = `<div class="results-head"><p class="note" aria-live="polite">${shown.length === 1 ? '1 lesson plan' : `${shown.length} lesson plans`}${active ? '' : ' coming up or not yet scheduled'}</p>
      ${active ? '<button class="btn" type="button" data-act="clear">Clear filters</button>' : ''}</div>`;
    if (!shown.length) {
      const past = filters.when === 'upcoming' && lessons.some(l => l.date && l.date < today);
      out.innerHTML = `${head}<div class="panel"><div class="panel-body stack"><p class="note">No lesson plans match${filters.query ? ` “${esc(filters.query)}”` : ''}.</p>
        <div class="row-btns">${active ? '<button class="btn" type="button" data-act="clear">Clear filters</button>' : ''}${past ? '<button class="btn" type="button" data-act="show-past">Show past plans</button>' : ''}</div></div></div>`;
      return;
    }
    out.innerHTML = head + groupByDate(shown, classes, filters.when).map(g => `<section class="lesson-group">
      <h2 class="group-head">${esc(g.date ? dayHeading(g.date, today) : 'No date yet')}</h2>
      <ul class="lesson-list">${g.lessons.map(l => item(l, byId.get(l.classId))).join('')}</ul>
    </section>`).join('');
  };

  const paint = (force = false) => { paintTop(force); paintResults(); };

  el.addEventListener('input', e => {
    const f = e.target.dataset.f;
    if (!f) return;
    filters = { ...filters, [f]: e.target.value };
    el.querySelector('[data-day-field]').hidden = filters.when !== 'day';
    paintToggle();
    paintResults();
  });
  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const { act, id } = b.dataset;
    if (act === 'new') lessonForm({ initial: filters.classId && filters.classId !== 'missing' ? { classId: filters.classId } : {} });
    else if (act === 'add-class') classForm();
    else if (act === 'toggle-filters') {
      const open = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', String(open));
      el.querySelector('.filters').classList.toggle('open', open);
    }
    else if (act === 'clear') { filters = { ...DEFAULT_FILTERS }; paint(true); el.querySelector('[data-f="query"]')?.focus(); }
    else if (act === 'show-past') { filters = { ...filters, when: 'past' }; paint(true); }
    else if (act === 'open') openLesson(id);
    else if (act === 'edit') { const l = store.get('lessons', id); if (l) lessonForm({ prev: l }); }
    else if (act === 'copy') duplicateLesson(id);
    else if (act === 'delete') deleteLesson(id);
  });

  const off = store.subscribe(() => { if (!el.isConnected) off(); else paint(); });
  paint();
}

function item(l, c) {
  const sub = [c ? c.name : 'Missing class', l.objectives.split('\n')[0]].filter(Boolean).join(' · ');
  return `<li class="lesson-item" style="--c: var(--${esc(c ? c.color : 's1')})">
    <button class="lesson-open" type="button" data-act="open" data-id="${esc(l.id)}">
      <b>${esc(l.title)}</b> ${statusPill(l.status)}
      <span class="lesson-sub">${esc(sub)}</span>
    </button>
    <div class="row-btns">
      <button class="btn" type="button" data-act="edit" data-id="${esc(l.id)}" aria-label="Edit ${esc(l.title)}">Edit</button>
      <button class="btn" type="button" data-act="copy" data-id="${esc(l.id)}" aria-label="Duplicate ${esc(l.title)}">Duplicate</button>
      <button class="btn danger" type="button" data-act="delete" data-id="${esc(l.id)}" aria-label="Delete ${esc(l.title)}">Delete</button>
    </div>
  </li>`;
}

/* ---------- View ---------- */

/** Shows a plan to read, with Edit, Duplicate, Mark taught and Delete. Also used by Today. */
export async function openLesson(id) {
  const l = store.get('lessons', id);
  if (!l) return;
  const c = store.get('classes', l.classId);
  const sections = FIELDS.filter(([k]) => l[k]).map(([k, label]) => `<h3>${esc(label)}</h3><p class="pre">${esc(l[k])}</p>`).join('');
  const choice = await ask({
    title: l.title,
    cls: 'lesson-sheet',
    cancel: 'Close',
    body: `<p class="lv-meta">${statusPill(l.status)} <span>${esc(c ? c.name : 'Missing class')}</span> · <span class="mono">${esc(l.date ? fmtLongDate(fromIso(l.date)) : 'No date yet')}</span></p>
      ${sections || '<p class="note">No details yet. Choose Edit to add objectives, activities and materials.</p>'}`,
    actions: [
      { label: 'Delete', value: 'delete', danger: true },
      { label: 'Duplicate', value: 'copy' },
      ...(l.status !== 'taught' ? [{ label: 'Mark taught', value: 'taught' }] : []),
      { label: 'Edit', value: 'edit', primary: true },
    ],
  });
  if (choice === 'edit') lessonForm({ prev: store.get('lessons', id) || l });
  else if (choice === 'copy') duplicateLesson(id);
  else if (choice === 'delete') deleteLesson(id);
  else if (choice === 'taught') {
    const res = store.update('lessons', id, { status: 'taught' });
    toast(res.ok ? 'Marked as taught' : res.errors._ || res.errors.classId || 'Couldn’t save');
  }
}

export function duplicateLesson(id) {
  const l = store.get('lessons', id);
  if (l) lessonForm({ initial: copyOf(l), copy: true });
}

/** Asks first; removes only this plan (never its class); offers Undo. */
export async function deleteLesson(id) {
  const l = store.get('lessons', id);
  if (!l) return;
  const choice = await ask({
    title: `Delete “${l.title}”?`,
    body: '<p>Only this lesson plan is removed. Its class and your other plans stay.</p>',
    actions: [{ label: 'Delete lesson plan', value: 'delete', primary: true, danger: true }],
  });
  if (choice !== 'delete') return;
  const res = store.remove('lessons', id);
  if (!res.ok) { toast(res.errors._); return; }
  toast(`Deleted ${l.title}`, { label: 'Undo', fn: () => { const r = store.restoreRemoved(res.removed); if (!r.ok) toast(r.errors._); } });
}

/* ---------- Form ---------- */

/**
 * The lesson plan form. `prev` edits a plan; otherwise a new plan starts from `initial`
 * (a class and date from Today or Classes, or a copy). Also used by Today and Classes.
 */
export function lessonForm({ prev = null, initial = {}, copy = false } = {}) {
  const v = { title: '', classId: '', date: '', status: 'draft', objectives: '', activities: '', materials: '', assessment: '', notes: '', ...initial, ...(prev || {}) };
  const classes = [...store.all('classes')].sort((a, b) => a.name.localeCompare(b.name));
  const known = classes.some(c => c.id === v.classId);
  const body = `
    <label class="field"><span>Title</span>
      <input class="field-in" name="title" maxlength="120" required autocomplete="off" placeholder="Photosynthesis lab" value="${esc(v.title)}">
      <small class="field-error" data-err="title" hidden></small></label>
    <div class="field-pair">
      <label class="field"><span>Class</span>
        <select class="field-in" name="classId" required>
          ${known ? '' : `<option value="" selected disabled>${v.classId ? 'Missing class: choose one' : 'Choose a class'}</option>`}
          ${classes.map(c => `<option value="${esc(c.id)}"${c.id === v.classId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
        <small class="field-error" data-err="classId" hidden></small></label>
      <label class="field"><span>Date <i>optional</i></span>
        <input class="field-in" type="date" name="date" value="${esc(v.date || '')}">
        <small class="field-error" data-err="date" hidden></small></label>
    </div>
    <div class="date-help" data-date-help aria-live="polite"></div>
    <fieldset class="field"><legend>Status</legend>
      <div class="pick-row">${LESSON_STATUS.map(([k, label]) => `<label class="pick"><input type="radio" name="status" value="${k}"${v.status === k ? ' checked' : ''}><span>${label}</span></label>`).join('')}</div>
      <p class="hint" data-status-hint>${esc(STATUS_HINT[v.status])}</p>
    </fieldset>
    ${FIELDS.map(([k, label, rows, ph]) => `<label class="field"><span>${label} <i>optional</i></span>
      <textarea class="field-in" name="${k}" rows="${rows}" placeholder="${esc(ph)}">${esc(v[k])}</textarea>
      <small class="field-error" data-err="${k}" hidden></small></label>`).join('')}
    <p class="hint">Plan for the whole class. Don’t add student names or other student information.</p>`;

  const sheet = formSheet({
    title: prev ? 'Edit lesson plan' : copy ? 'Duplicate lesson plan' : 'New lesson plan',
    submit: prev ? 'Save changes' : copy ? 'Save copy' : 'Save lesson plan',
    body,
    onSubmit(form) {
      const names = ['title', 'classId', 'date', ...FIELDS.map(([k]) => k)];
      for (const k of names) fieldError(form, k, '');
      const formError = form.querySelector('.form-error');
      formError.hidden = true;
      const input = Object.fromEntries(names.map(k => [k, form.elements[k].value]));
      input.date = input.date || null;
      input.status = form.querySelector('input[name="status"]:checked')?.value || 'draft';
      // A copy is a new plan; the original is never touched.
      const res = prev ? store.update('lessons', prev.id, input) : store.create('lessons', input);
      if (!res.ok) {
        const { _: general, ...fields } = res.errors;
        for (const [k, msg] of Object.entries(fields)) fieldError(form, k, friendly(k, msg));
        if (general) { formError.textContent = general; formError.hidden = false; }
        form.querySelector('[aria-invalid="true"]')?.focus();
        return false;
      }
      toast(prev ? 'Lesson plan saved' : copy ? `Saved a copy of ${res.record.title}` : `Saved ${res.record.title}`);
      return true;
    },
  });

  const form = sheet.el.querySelector('form');
  const help = () => {
    const box = form.querySelector('[data-date-help]');
    const classId = form.elements.classId.value, date = form.elements.date.value;
    const c = store.get('classes', classId);
    if (!c) { box.innerHTML = ''; return; }
    const data = { classes: store.all('classes'), daysOff: store.all('daysOff'), settings: store.settings() };
    if (!date) {
      const next = nextMeetingDates(classId, data, todayIso());
      box.innerHTML = next.length ? `<span>Next ${esc(c.name)} classes:</span> ${next.map(d => `<button class="btn chip" type="button" data-pick-date="${d}">${esc(short(d))}</button>`).join(' ')}`
        : `<span>${esc(c.name)} has no meeting times yet.</span>`;
      return;
    }
    const off = dayOffOn(date, data.daysOff);
    const m = meetingsOn(date, data).find(x => x.class.id === classId);
    box.innerHTML = off ? `<span class="warn-text">That’s a day off (${esc(off.title)}), so ${esc(c.name)} doesn’t meet. You can still save the plan.</span>`
      : m ? `<span>${esc(c.name)} meets at ${esc(fmtTime(m.meeting.start))} that day.</span>`
      : `<span class="warn-text">${esc(c.name)} doesn’t meet on ${esc(WEEKDAYS[fromIso(date).getDay()])}s. You can still save the plan.</span>`;
  };
  form.addEventListener('change', e => {
    if (e.target.name === 'status') form.querySelector('[data-status-hint]').textContent = STATUS_HINT[e.target.value];
    if (e.target.name === 'classId' || e.target.name === 'date') help();
  });
  form.addEventListener('click', e => {
    const b = e.target.closest('[data-pick-date]');
    if (!b) return;
    form.elements.date.value = b.dataset.pickDate;
    help();
    form.elements.date.focus();
  });
  help();
  return sheet;
}
