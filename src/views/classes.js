// Classes & schedule: the classes taught, when they meet, a dated week to check the schedule against,
// and the days school is out. Everything is read from and saved through the store.
import { store } from '../data/index.js';
import { CLASS_COLORS, DAY_OFF_KINDS, cleanRecord } from '../data/schema.js';
import { meetingsOn, dayOffOn, conflicts, findOverlap, groupMeetings, weekOf } from '../data/schedule.js';
import { iso, fromIso, addDays, fmtTime, fmtDay, shortWeekday, WEEKDAYS } from '../lib/dates.js';
import { ask, formSheet, fieldError } from '../lib/dialog.js';
import { toast } from '../lib/toast.js';
import { esc } from '../lib/dom.js';
import { ICONS } from '../lib/icons.js';
import { viewHead } from './placeholder.js';

const KIND_LABEL = Object.fromEntries(DAY_OFF_KINDS);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const timeRange = m => `${fmtTime(m.start)}–${fmtTime(m.end)}`;
const weekOrder = ws => Array.from({ length: 7 }, (_, i) => (i + ws) % 7);
const dayList = days => days.map(d => shortWeekday(d)).join(', ');

/** "Nov 26" or "Nov 25 – 27" or "Dec 21 – Jan 1". */
function fmtRange(start, end) {
  const a = fromIso(start), b = fromIso(end || start);
  const md = d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (start === (end || start)) return fmtDay(a);
  if (a.getFullYear() !== b.getFullYear()) return `${a.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} – ${b.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  return a.getMonth() === b.getMonth() ? `${md(a)} – ${b.getDate()}` : `${md(a)} – ${md(b)}`;
}

// Friendlier words for a missing required field.
const REQUIRED = { name: 'Give the class a name', title: 'Give it a name, like “Thanksgiving”', start: 'Choose the first day' };
const friendly = (field, msg) => (msg === 'Required' && REQUIRED[field]) || msg;

export function render(container, now = new Date()) {
  container.innerHTML = `<section class="view">
    ${viewHead({ eyebrow: 'Setup', title: 'Classes & schedule', lede: 'The classes you teach, when they meet and the days school is out.' })}
    <div id="classesPanel"></div>
    <div id="schedulePanel"></div>
    <div id="daysOffPanel"></div>
  </section>`;
  const el = container.querySelector('section.view');
  const today = iso(now);
  let shown = today; // a date in the week the schedule shows

  const paint = () => {
    const ws = store.settings().weekStartsOn;
    el.querySelector('#classesPanel').innerHTML = classesPanel(ws);
    el.querySelector('#schedulePanel').innerHTML = store.all('classes').length ? schedulePanel(shown, today, ws) : '';
    el.querySelector('#daysOffPanel').innerHTML = daysOffPanel(today);
  };

  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const { act, id } = b.dataset;
    if (act === 'add-class') classForm();
    else if (act === 'edit-class') { const c = store.get('classes', id); if (c) classForm(c); }
    else if (act === 'delete-class') deleteClass(id);
    else if (act === 'add-off') dayOffForm();
    else if (act === 'edit-off') { const d = store.get('daysOff', id); if (d) dayOffForm(d); }
    else if (act === 'delete-off') deleteDayOff(id);
    else if (act === 'week') {
      shown = b.dataset.to === 'today' ? today : iso(addDays(fromIso(shown), b.dataset.to === 'next' ? 7 : -7));
      paint();
      el.querySelector(`[data-act="week"][data-to="${b.dataset.to}"]`)?.focus();
    }
  });

  const off = store.subscribe(() => { if (!el.isConnected) off(); else paint(); });
  paint();
}

/* ---------- Classes list ---------- */

function classesPanel(ws) {
  const classes = store.all('classes');
  if (!classes.length) {
    return `<div class="panel empty">
      <div class="empty-icon">${ICONS.classes}</div>
      <h2>No classes yet</h2>
      <p>Add each class or period you teach, with the days and times it meets. Today and your week are built from them.</p>
      <button class="btn primary" type="button" data-act="add-class">Add your first class</button>
    </div>`;
  }
  const sorted = [...classes].sort((a, b) => firstMeeting(a, ws).localeCompare(firstMeeting(b, ws)) || a.name.localeCompare(b.name));
  return `<div class="panel">
    <div class="panel-head"><h2>Classes</h2><span class="count">${classes.length}</span>
      <button class="btn primary head-btn" type="button" data-act="add-class">Add class</button></div>
    <ul class="class-list">${sorted.map(c => classItem(c, classes, ws)).join('')}</ul>
  </div>`;
}

// Sorts classes by when they first meet in the week; ones with no times go last.
const firstMeeting = (c, ws) => {
  const g = c.meetings.map(m => `${(m.day - ws + 7) % 7}${m.start}`).sort();
  return g[0] || '9';
};

function classItem(c, classes, ws) {
  const meta = [c.subject, c.room && `Room ${c.room}`].filter(Boolean).join(' · ');
  const clashes = conflicts(c.meetings, classes, c.id);
  const clashNames = [...new Set(clashes.map(x => x.class.name))];
  return `<li class="class-item" style="--c: var(--${esc(c.color)})">
    <div class="class-main">
      <h3><span class="dot" aria-hidden="true"></span>${esc(c.name)}</h3>
      ${meta ? `<p class="class-meta">${esc(meta)}</p>` : ''}
      ${c.meetings.length
        ? `<ul class="meet-list" aria-label="Meeting times">${groupMeetings(c.meetings, ws).map(g => `<li><b>${esc(dayList(g.days))}</b> <span class="mono">${esc(timeRange(g))}</span></li>`).join('')}</ul>`
        : '<p class="note small">No meeting times yet. Edit the class to add them.</p>'}
      ${clashNames.length ? `<p class="clash">Overlaps ${esc(clashNames.join(', '))}</p>` : ''}
      ${c.notes ? `<p class="class-notes">${esc(c.notes)}</p>` : ''}
    </div>
    <div class="row-btns">
      <button class="btn" type="button" data-act="edit-class" data-id="${esc(c.id)}" aria-label="Edit ${esc(c.name)}">Edit</button>
      <button class="btn danger" type="button" data-act="delete-class" data-id="${esc(c.id)}" aria-label="Delete ${esc(c.name)}">Delete</button>
    </div>
  </li>`;
}

/* ---------- The week, with dates ---------- */

function schedulePanel(shown, today, ws) {
  const data = { classes: store.all('classes'), daysOff: store.all('daysOff'), settings: store.settings() };
  const usedDays = new Set(data.classes.flatMap(c => c.meetings.map(m => m.day)));
  // Weekdays always; Saturday and Sunday only when a class meets on them.
  const dates = weekOf(shown, ws).filter(d => { const wd = fromIso(d).getDay(); return (wd > 0 && wd < 6) || usedDays.has(wd); });
  const week = weekOf(shown, ws);
  const thisWeek = week.includes(today);
  return `<div class="panel">
    <div class="panel-head"><h2>Schedule</h2>
      <div class="week-nav">
        <button class="icon-btn" type="button" data-act="week" data-to="prev" aria-label="Previous week">‹</button>
        <span class="week-label mono" aria-live="polite">${esc(fmtRange(week[0], week[6]))}</span>
        <button class="icon-btn" type="button" data-act="week" data-to="next" aria-label="Next week">›</button>
        ${thisWeek ? '' : '<button class="btn" type="button" data-act="week" data-to="today">This week</button>'}
      </div>
    </div>
    <ol class="week-grid">${dates.map(d => {
      const off = dayOffOn(d, data.daysOff);
      const meetings = meetingsOn(d, data);
      return `<li class="day${d === today ? ' is-today' : ''}${off ? ' is-off' : ''}">
        <h3>${esc(fmtDay(fromIso(d)))}${d === today ? ' <span class="badge">Today</span>' : ''}</h3>
        ${off ? `<p class="off-note">No classes · ${esc(off.title)}</p>`
          : meetings.length ? `<ul>${meetings.map(x => `<li style="--c: var(--${esc(x.class.color)})"><span class="mono">${esc(fmtTime(x.meeting.start))}</span> <b>${esc(x.class.name)}</b>${x.class.room ? ` <span class="room">${esc(x.class.room)}</span>` : ''}</li>`).join('')}</ul>`
          : '<p class="none">No classes</p>'}
      </li>`;
    }).join('')}</ol>
  </div>`;
}

/* ---------- Days off ---------- */

function daysOffPanel(today) {
  const all = [...store.all('daysOff')].sort((a, b) => a.start.localeCompare(b.start));
  const upcoming = all.filter(d => d.end >= today), past = all.filter(d => d.end < today).reverse();
  const item = d => `<li>
    <div><b>${esc(d.title)}</b>${d.start <= today ? ' <span class="badge">Now</span>' : ''}
      <span class="off-meta"><span class="mono">${esc(fmtRange(d.start, d.end))}</span> · ${esc(KIND_LABEL[d.kind])}</span></div>
    <div class="row-btns">
      <button class="btn" type="button" data-act="edit-off" data-id="${esc(d.id)}" aria-label="Edit ${esc(d.title)}">Edit</button>
      <button class="btn danger" type="button" data-act="delete-off" data-id="${esc(d.id)}" aria-label="Delete ${esc(d.title)}">Delete</button>
    </div>
  </li>`;
  return `<div class="panel">
    <div class="panel-head"><h2>Days off</h2>${all.length ? `<span class="count">${all.length}</span>` : ''}
      <button class="btn head-btn" type="button" data-act="add-off">Add day off</button></div>
    <div class="panel-body">
      ${upcoming.length ? `<ul class="off-list">${upcoming.map(item).join('')}</ul>`
        : `<p class="note">${past.length ? 'No upcoming days off.' : 'Add holidays, breaks and other days school is out. Classes aren’t shown as meeting on those days.'}</p>`}
      ${past.length ? `<details class="past"><summary>Past days off (${past.length})</summary><ul class="off-list">${past.map(item).join('')}</ul></details>` : ''}
    </div>
  </div>`;
}

/* ---------- Class form ---------- */

function dayChecks(ws, picked) {
  return weekOrder(ws).map(d => `<label class="day-pick"><input type="checkbox" value="${d}" aria-label="${WEEKDAYS[d]}"${picked.includes(d) ? ' checked' : ''}><span aria-hidden="true">${esc(shortWeekday(d))}</span></label>`).join('');
}

function meetRow(ws, g = { days: [], start: '', end: '' }) {
  return `<div class="meet-row" data-row>
    <div class="day-picks" role="group" aria-label="Days">${dayChecks(ws, g.days)}</div>
    <div class="times">
      <label><span class="sr">Starts</span><input class="field-in" type="time" data-start value="${esc(g.start || '')}"></label>
      <span aria-hidden="true">to</span>
      <label><span class="sr">Ends</span><input class="field-in" type="time" data-end value="${esc(g.end || '')}"></label>
      <button class="icon-btn" type="button" data-remove-row aria-label="Remove this time">×</button>
    </div>
    <p class="field-error" data-row-err role="alert" hidden></p>
  </div>`;
}

const nextColor = () => {
  const used = new Set(store.all('classes').map(c => c.color));
  return CLASS_COLORS.find(c => !used.has(c)) || CLASS_COLORS[store.all('classes').length % CLASS_COLORS.length];
};

/** Reads the meeting rows. Returns { meetings } or { rowErrors: [[rowEl, message]] }. Untouched empty rows are ignored. */
export function readMeetingRows(form, prev = []) {
  const meetings = [], rowErrors = [];
  for (const row of form.querySelectorAll('[data-row]')) {
    const days = [...row.querySelectorAll('input[type="checkbox"]:checked')].map(i => +i.value);
    const start = row.querySelector('[data-start]').value, end = row.querySelector('[data-end]').value;
    let problem = '';
    if (!days.length && !start && !end) continue;
    if (!days.length) problem = 'Pick at least one day';
    else if (!start) problem = 'Add a start time';
    else if (!end) problem = 'Add an end time';
    else if (end <= start) problem = 'The end time must be after the start time';
    if (problem) { rowErrors.push([row, problem]); continue; }
    for (const day of days) {
      const same = prev.find(m => m.day === day && m.start === start && m.end === end);
      meetings.push({ ...(same ? { id: same.id } : {}), day, start, end });
    }
  }
  return rowErrors.length ? { rowErrors } : { meetings };
}

function classForm(prev = null) {
  const ws = store.settings().weekStartsOn;
  const color = prev ? prev.color : nextColor();
  const groups = prev ? groupMeetings(prev.meetings, ws) : [];
  const body = `
    <label class="field"><span>Class name</span>
      <input class="field-in" name="name" maxlength="80" required autocomplete="off" placeholder="Biology, Period 2" aria-describedby="errName" value="${esc(prev ? prev.name : '')}">
      <small class="field-error" id="errName" data-err="name" hidden></small></label>
    <div class="field-pair">
      <label class="field"><span>Subject <i>optional</i></span>
        <input class="field-in" name="subject" maxlength="60" autocomplete="off" value="${esc(prev ? prev.subject : '')}">
        <small class="field-error" data-err="subject" hidden></small></label>
      <label class="field"><span>Room <i>optional</i></span>
        <input class="field-in" name="room" maxlength="30" autocomplete="off" value="${esc(prev ? prev.room : '')}">
        <small class="field-error" data-err="room" hidden></small></label>
    </div>
    <fieldset class="field"><legend>Color</legend>
      <div class="swatches">${CLASS_COLORS.map((c, i) => `<label class="swatch" style="--c: var(--${c})"><input type="radio" name="color" value="${c}" aria-label="Color ${i + 1}"${c === color ? ' checked' : ''}><span></span></label>`).join('')}</div>
    </fieldset>
    <fieldset class="field"><legend>Meeting times</legend>
      <p class="hint">Pick the days that share a time. Add another time for days that differ.</p>
      <div class="meet-rows">${(groups.length ? groups : [undefined]).map(g => meetRow(ws, g)).join('')}</div>
      <div><button class="btn" type="button" data-add-row>Add another time</button></div>
      <p class="field-error" data-err="meetings" role="alert" hidden></p>
      <div class="clash-box" role="alert" hidden></div>
    </fieldset>
    <label class="field"><span>Notes <i>optional</i></span>
      <textarea class="field-in" name="notes" rows="3" maxlength="2000" placeholder="Co-teacher, bell schedule, things to remember">${esc(prev ? prev.notes : '')}</textarea>
      <small class="field-error" data-err="notes" hidden></small></label>
    <p class="hint">Don’t add student names here. TeacherSync is for planning, not student records.</p>`;

  let confirmedClash = null; // the meetings the teacher chose to save despite overlapping other classes
  const sheet = formSheet({
    title: prev ? `Edit ${prev.name}` : 'Add a class',
    submit: prev ? 'Save changes' : 'Add class',
    body,
    onSubmit(form) {
      for (const k of ['name', 'subject', 'room', 'notes', 'meetings']) fieldError(form, k, '');
      for (const p of form.querySelectorAll('[data-row-err]')) { p.hidden = true; p.textContent = ''; }
      const formError = form.querySelector('.form-error');
      formError.hidden = true;

      const fields = {
        name: form.elements.name.value, subject: form.elements.subject.value, room: form.elements.room.value,
        notes: form.elements.notes.value, color: form.querySelector('input[name="color"]:checked')?.value,
      };
      const read = readMeetingRows(form, prev ? prev.meetings : []);
      if (read.rowErrors) {
        // Show every problem at once: the other fields' too.
        const { meetings: _m, ...others } = cleanRecord('classes', { ...fields, meetings: [] }, { strict: true }).errors;
        for (const [k, msg] of Object.entries(others)) fieldError(form, k, friendly(k, msg));
        for (const [row, msg] of read.rowErrors) { const p = row.querySelector('[data-row-err]'); p.textContent = msg; p.hidden = false; }
        (form.querySelector('[aria-invalid="true"]') || read.rowErrors[0][0].querySelector('input')).focus();
        return false;
      }
      const { meetings } = read;
      const own = findOverlap(meetings);
      if (own) {
        fieldError(form, 'meetings', `${WEEKDAYS[own[0].day]}: ${timeRange(own[0])} overlaps ${timeRange(own[1])}. A class can’t meet twice at the same time.`);
        return false;
      }

      // Overlapping another class is allowed (combined or co-taught sections), after a warning.
      const clashes = conflicts(meetings, store.all('classes'), prev && prev.id);
      const box = form.querySelector('.clash-box');
      const sig = JSON.stringify(meetings.map(m => [m.day, m.start, m.end]));
      if (clashes.length && confirmedClash !== sig) {
        confirmedClash = sig;
        box.innerHTML = `<b>These times overlap another class:</b><ul>${clashes.map(x => `<li>${esc(x.class.name)}: ${esc(WEEKDAYS[x.meeting.day])} ${esc(timeRange(x.meeting))}</li>`).join('')}</ul>
          <span>Fix the times, or choose <b>Save anyway</b> if they really meet together.</span>`;
        box.hidden = false;
        form.querySelector('[data-submit]').textContent = 'Save anyway';
        return false;
      }

      const input = { ...fields, meetings };
      const res = prev ? store.update('classes', prev.id, input) : store.create('classes', input);
      if (!res.ok) {
        const { _: general, ...fields } = res.errors;
        for (const [k, msg] of Object.entries(fields)) fieldError(form, k, friendly(k, msg));
        if (general) { formError.textContent = general; formError.hidden = false; }
        form.querySelector('[aria-invalid="true"]')?.focus();
        return false;
      }
      toast(prev ? 'Class saved' : `Added ${res.record.name}`);
      return true;
    },
  });

  const form = sheet.el.querySelector('form');
  form.addEventListener('click', e => {
    if (e.target.closest('[data-add-row]')) {
      form.querySelector('.meet-rows').insertAdjacentHTML('beforeend', meetRow(ws));
      form.querySelector('.meet-rows [data-row]:last-child input').focus();
    } else if (e.target.closest('[data-remove-row]')) {
      e.target.closest('[data-row]').remove();
      if (!form.querySelector('[data-row]')) form.querySelector('.meet-rows').insertAdjacentHTML('beforeend', meetRow(ws));
      resetClash();
    }
  });
  // Changing the times asks about overlaps again.
  const resetClash = () => {
    confirmedClash = null;
    form.querySelector('.clash-box').hidden = true;
    form.querySelector('[data-submit]').textContent = prev ? 'Save changes' : 'Add class';
  };
  form.querySelector('.meet-rows').addEventListener('change', resetClash);
  return sheet;
}

async function deleteClass(id) {
  const c = store.get('classes', id);
  if (!c) return;
  const lessons = store.all('lessons').filter(l => l.classId === id).length;
  const assignments = store.all('assignments').filter(a => a.classId === id).length;
  const also = [lessons && plural(lessons, 'lesson plan', 'lesson plans'), assignments && plural(assignments, 'assignment', 'assignments')].filter(Boolean);
  const choice = await ask({
    title: `Delete ${c.name}?`,
    body: `<p>It will be removed from your classes and schedule.</p>
      ${also.length ? `<p>Its <strong>${esc(also.join(' and '))}</strong> will be deleted too. A safety copy is saved first (Settings → Safety copies).</p>` : ''}`,
    actions: [{ label: 'Delete class', value: 'delete', primary: true, danger: true }],
  });
  if (choice !== 'delete') return;
  const res = store.remove('classes', id);
  if (!res.ok) { toast(res.errors._); return; }
  toast(`Deleted ${c.name}`, { label: 'Undo', fn: () => { const r = store.restoreRemoved(res.removed); if (!r.ok) toast(r.errors._); } });
}

/* ---------- Day off form ---------- */

function dayOffForm(prev = null) {
  const body = `
    <label class="field"><span>Name</span>
      <input class="field-in" name="title" maxlength="80" required autocomplete="off" placeholder="Thanksgiving break" value="${esc(prev ? prev.title : '')}">
      <small class="field-error" data-err="title" hidden></small></label>
    <label class="field"><span>Kind</span>
      <select class="field-in" name="kind">${DAY_OFF_KINDS.map(([v, label]) => `<option value="${v}"${(prev ? prev.kind : 'holiday') === v ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
    <div class="field-pair">
      <label class="field"><span>First day</span>
        <input class="field-in" type="date" name="start" required value="${esc(prev ? prev.start : '')}">
        <small class="field-error" data-err="start" hidden></small></label>
      <label class="field"><span>Last day <i>optional</i></span>
        <input class="field-in" type="date" name="end" value="${esc(prev && prev.end !== prev.start ? prev.end : '')}">
        <small class="field-error" data-err="end" hidden></small></label>
    </div>
    <p class="hint">Leave the last day empty for a single day. Classes aren’t shown as meeting on any of these days.</p>`;
  return formSheet({
    title: prev ? `Edit ${prev.title}` : 'Add a day off',
    submit: prev ? 'Save changes' : 'Add day off',
    body,
    onSubmit(form) {
      for (const k of ['title', 'start', 'end']) fieldError(form, k, '');
      const formError = form.querySelector('.form-error');
      formError.hidden = true;
      const v = name => form.elements[name].value;
      // An empty last day means a single day, also when editing.
      const input = { title: v('title'), kind: v('kind'), start: v('start'), end: v('end') || v('start') };
      const res = prev ? store.update('daysOff', prev.id, input) : store.create('daysOff', input);
      if (!res.ok) {
        const { _: general, ...fields } = res.errors;
        for (const [k, msg] of Object.entries(fields)) fieldError(form, k, friendly(k, msg));
        if (general) { formError.textContent = general; formError.hidden = false; }
        form.querySelector('[aria-invalid="true"]')?.focus();
        return false;
      }
      toast(prev ? 'Day off saved' : `Added ${res.record.title}`);
      return true;
    },
  });
}

function deleteDayOff(id) {
  const d = store.get('daysOff', id);
  if (!d) return;
  const res = store.remove('daysOff', id);
  if (!res.ok) { toast(res.errors._); return; }
  toast(`Deleted ${d.title}`, { label: 'Undo', fn: () => store.restoreRemoved(res.removed) });
}
