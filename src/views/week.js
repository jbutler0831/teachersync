// Week: classes, lesson plans, assignment deadlines and tasks for one week, built by data/week.js from the store.
// A grid on computers, a compact grid on tablets and a day-by-day list on phones (CSS only; one markup).
// Items open the same sheets as everywhere else; day headings open that day in Today. Export writes an .ics file.
import { store } from '../data/index.js';
import { weekDays, weeksFrom, weekLabel, shiftWeek, undated } from '../data/week.js';
import { calendarEvents, toICS, KINDS, icsFileName, ICS_TYPE } from '../data/ics.js';
import { LESSON_STATUS, ASSIGNMENT_STATUS } from '../data/schema.js';
import { DONE } from '../data/assignments.js';
import { isIsoDate } from '../data/fields.js';
import { iso, fromIso, addDays, fmtDay, fmtTime, fmtLongDate } from '../lib/dates.js';
import { ask, formSheet } from '../lib/dialog.js';
import { downloadText } from '../lib/files.js';
import { toast } from '../lib/toast.js';
import { esc } from '../lib/dom.js';
import { ICONS } from '../lib/icons.js';
import { viewHead } from './placeholder.js';
import { classForm, dayOffForm, fmtRange } from './classes.js';
import { openLesson, lessonForm } from './lessons.js';
import { openAssignment } from './assignments.js';
import { openTask, showTasksView } from './tasks.js';
import { showTodayOn } from './today.js';

const SHOW = 5; // items shown per day before "Show N more"
const LESSON = Object.fromEntries(LESSON_STATUS);
const ASSIGNMENT = Object.fromEntries(ASSIGNMENT_STATUS);
const KIND_LABEL = { due: 'Due', grade: 'Grade by', lesson: 'Lesson plan', task: 'Task' };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const read = () => ({
  classes: store.all('classes'), daysOff: store.all('daysOff'), lessons: store.all('lessons'),
  assignments: store.all('assignments'), tasks: store.all('tasks'), settings: store.settings(),
});

export function render(container) {
  container.innerHTML = `<section class="view week">
    ${viewHead({ eyebrow: 'Calendar', title: 'Week', lede: 'Classes, lesson plans, deadlines and tasks, a week at a time.' })}
    <div data-paint></div>
    <p class="sr" aria-live="polite" data-announce></p>
  </section>`;
  const el = container.querySelector('section.view');
  const today = () => iso(new Date());
  let shown = today();            // any date in the week shown
  const expanded = new Set();     // days showing all their items

  const paint = () => {
    const f = document.activeElement;
    const key = f && el.contains(f) ? (f.dataset.week && `[data-week="${f.dataset.week}"]`) || (f.dataset.more && `[data-more="${f.dataset.more}"]`) || (f.dataset.act && `[data-act="${f.dataset.act}"]`) : null;
    el.querySelector('[data-paint]').innerHTML = page(shown, today(), expanded);
    if (key) (el.querySelector(key) || el.querySelector('h1')).focus({ preventScroll: true });
  };
  const go = date => {
    shown = date;
    expanded.clear();
    paint();
    const ws = store.settings().weekStartsOn;
    const days = weekDays(shown, read(), today());
    el.querySelector('[data-announce]').textContent = `${fmtRange(days[0].date, days[6].date)}, ${weekLabel(weeksFrom(days[0].date, today(), ws))}`;
  };

  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const ws = store.settings().weekStartsOn;
    const d = b.dataset;
    if (d.week === 'prev' || d.week === 'next') go(shiftWeek(shown, ws, d.week === 'next' ? 1 : -1));
    else if (d.week === 'this') { go(today()); el.querySelector('h1').focus(); }
    else if (d.more) { expanded.has(d.more) ? expanded.delete(d.more) : expanded.add(d.more); paint(); }
    else if (d.day) showTodayOn(d.day);
    else if (d.open === 'class') openMeeting(d.id, d.meeting, d.date);
    else if (d.open === 'lesson') openLesson(d.id);
    else if (d.open === 'due' || d.open === 'grade') openAssignment(d.id);
    else if (d.open === 'task') openTask(d.id);
    else if (d.open === 'off') { const off = store.get('daysOff', d.id); if (off) dayOffForm(off); }
    else if (d.act === 'export') exportSheet(shown);
    else if (d.act === 'add-class') classForm();
    else if (d.act === 'undated-tasks') showTasksView('open');
  });
  el.addEventListener('change', e => {
    if (e.target.dataset.week === 'pick' && isIsoDate(e.target.value)) go(e.target.value);
  });

  const off = store.subscribe(() => { if (!el.isConnected) off(); else paint(); });
  paint();
}

function page(shown, today, expanded) {
  const data = read();
  const ws = data.settings.weekStartsOn;
  const days = weekDays(shown, data, today);
  const n = weeksFrom(days[0].date, today, ws);
  const hasAny = data.classes.length || data.lessons.length || data.assignments.length || data.tasks.length || data.daysOff.length;
  if (!hasAny) {
    return `<div class="panel empty"><div class="empty-icon">${ICONS.week}</div><h2>Nothing to show yet</h2>
      <p>Add the classes you teach and when they meet. Their meetings, your lesson plans, due dates and tasks then appear here, a week at a time.</p>
      <button class="btn primary" type="button" data-act="add-class">Add your first class</button></div>`;
  }
  // Saturday and Sunday only when something is on them (or the week is shown Sunday first).
  const shownDays = days.filter(d => { const wd = fromIso(d.date).getDay(); return (wd > 0 && wd < 6) || d.count || d.dayOff || (ws === 0 && wd === 0); });
  const total = days.reduce((s, d) => s + d.count, 0);
  const u = undated(data);
  const nav = `<div class="week-bar">
    <nav class="day-nav${n === 0 ? '' : ' is-other'}" aria-label="Choose a week">
      <button class="icon-btn" type="button" data-week="prev" aria-label="Previous week" title="Previous week">‹</button>
      <p class="day-label"><b class="mono">${esc(fmtRange(days[0].date, days[6].date))}</b> <span class="badge${n === 0 ? '' : ' other'}">${esc(weekLabel(n))}</span></p>
      <button class="icon-btn" type="button" data-week="next" aria-label="Next week" title="Next week">›</button>
      ${n === 0 ? '' : '<button class="btn" type="button" data-week="this">This week</button>'}
      <label class="day-jump"><span class="sr">Go to the week of a date</span><input class="field-in" type="date" data-week="pick" value="${esc(shown)}"></label>
    </nav>
    <button class="btn" type="button" data-act="export">Export to calendar…</button>
  </div>`;
  const legend = `<p class="week-legend"><span class="kind k-class">Class</span> <span class="kind k-lesson">Lesson plan</span> <span class="kind k-due">Due</span> <span class="kind k-grade">Grade by</span> <span class="kind k-task">Task</span> <span class="kind k-off">Day off</span></p>`;
  const empty = total ? '' : `<p class="note">Nothing scheduled ${n === 0 ? 'this week' : 'in this week'}${shownDays.some(d => d.dayOff) ? ' (classes don’t meet on its days off)' : ''}.</p>`;
  const notOn = u.tasks || u.lessons ? `<p class="note small">Not on the calendar because they have no date: ${[u.tasks && `<button class="btn chip" type="button" data-act="undated-tasks">${plural(u.tasks, 'open task', 'open tasks')}</button>`, u.lessons && `<a class="btn chip" href="#/lessons">${plural(u.lessons, 'lesson plan', 'lesson plans')}</a>`].filter(Boolean).join(' ')}</p>` : '';
  return `${nav}${legend}${empty}
    <ol class="week-cal" style="--days: ${shownDays.length}">${shownDays.map(d => dayCell(d, today, expanded.has(d.date))).join('')}</ol>
    ${notOn}`;
}

function dayCell(d, today, open) {
  const items = [...d.allDay.map(allDayItem), ...d.classes.map(meetingItem)];
  const visible = open ? items : items.slice(0, SHOW);
  const rest = items.length - SHOW;
  const isToday = d.date === today;
  return `<li class="wk-day${isToday ? ' is-today' : ''}${d.dayOff ? ' is-off' : ''}${d.date < today ? ' is-past' : ''}">
    <h2 class="wk-head"><button type="button" data-day="${d.date}" aria-label="${esc(fmtLongDate(fromIso(d.date)))}${isToday ? ', today' : ''}. ${esc(plural(d.count, 'item', 'items'))}. Open in Today">
      <span class="mono">${esc(fmtDay(fromIso(d.date)))}</span>${isToday ? ' <span class="badge">Today</span>' : ''}</button></h2>
    ${d.dayOff ? `<button class="wk-off" type="button" data-open="off" data-id="${esc(d.dayOff.id)}"><span class="kind k-off">Day off</span> ${esc(d.dayOff.title)}<span class="sr">. No classes.</span></button>` : ''}
    ${items.length ? `<ul class="wk-items">${visible.join('')}</ul>` : d.dayOff ? '' : '<p class="none">Nothing scheduled</p>'}
    ${rest > 0 ? `<button class="btn chip wk-more" type="button" data-more="${d.date}" aria-expanded="${open}">${open ? 'Show fewer' : `Show ${rest} more`}</button>` : ''}
  </li>`;
}

function allDayItem(x) {
  const r = x.record;
  const status = x.kind === 'lesson' ? LESSON[r.status] : x.kind === 'task' ? (r.done ? 'Done' : r.priority === 'high' ? 'High priority' : '') : ASSIGNMENT[r.status];
  const done = (x.kind === 'task' && r.done) || ((x.kind === 'due') && DONE.has(r.status));
  return `<li class="wk-item k-${x.kind}${done ? ' is-done' : ''}" style="--c: var(--${esc(x.class ? x.class.color : 'line')})">
    <button type="button" data-open="${x.kind}" data-id="${esc(r.id)}">
      <span class="kind k-${x.kind}">${KIND_LABEL[x.kind]}</span>${x.flag ? ` <span class="status s-late">${esc(x.flag)}</span>` : ''}
      <b>${esc(r.title)}</b>
      <span class="wk-meta">${esc([x.class ? x.class.name : '', status].filter(Boolean).join(' · '))}</span>
    </button>
  </li>`;
}

function meetingItem(x) {
  const c = x.class;
  return `<li class="wk-item k-class" style="--c: var(--${esc(c.color)})">
    <button type="button" data-open="class" data-id="${esc(c.id)}" data-meeting="${esc(x.meeting.id)}" data-date="${esc(x.date || '')}">
      <span class="mono wk-time">${esc(fmtTime(x.meeting.start))}–${esc(fmtTime(x.meeting.end))}</span>
      <b>${esc(c.name)}</b>
      <span class="wk-meta">${esc([c.room && `Room ${c.room}`, x.lessons.length ? '' : 'No lesson plan'].filter(Boolean).join(' · '))}</span>
    </button>
    ${x.lessons.map(l => `<button type="button" class="wk-lesson" data-open="lesson" data-id="${esc(l.id)}"><span class="kind k-lesson">Lesson plan</span> ${esc(l.title)} <span class="status s-${esc(l.status)}">${esc(LESSON[l.status])}</span></button>`).join('')}
  </li>`;
}

/** A class meeting: its time and room, and the way to its lesson plan or to plan one. */
async function openMeeting(classId, meetingId, date) {
  const c = store.get('classes', classId);
  if (!c) return;
  const m = c.meetings.find(x => x.id === meetingId);
  const lessons = store.all('lessons').filter(l => l.classId === classId && l.date === date);
  const choice = await ask({
    title: c.name,
    cls: 'lesson-sheet',
    cancel: 'Close',
    body: `<p class="lv-meta"><span class="kind k-class">Class</span> <span class="mono">${esc(fmtLongDate(fromIso(date)))}${m ? ` · ${esc(fmtTime(m.start))}–${esc(fmtTime(m.end))}` : ''}</span></p>
      ${[c.subject, c.room && `Room ${c.room}`].filter(Boolean).length ? `<p>${esc([c.subject, c.room && `Room ${c.room}`].filter(Boolean).join(' · '))}</p>` : ''}
      <p>${lessons.length ? `Lesson plan: <strong>${esc(lessons[0].title)}</strong> (${esc(LESSON[lessons[0].status])})` : 'No lesson plan for this day yet.'}</p>`,
    actions: [
      { label: 'Edit class', value: 'edit' },
      lessons.length ? { label: 'Open lesson plan', value: 'lesson', primary: true } : { label: 'Plan a lesson', value: 'plan', primary: true },
    ],
  });
  if (choice === 'edit') { const cur = store.get('classes', classId); if (cur) classForm(cur); }
  else if (choice === 'lesson') openLesson(lessons[0].id);
  else if (choice === 'plan') lessonForm({ initial: { classId, date } });
}

/* ---------- Export ---------- */

const RANGES = [[1, 'The week shown'], [4, '4 weeks, from the week shown'], [12, '12 weeks, from the week shown']];

/** Asks what to export (range and kinds), shows how many events that is, and downloads the .ics file. */
export function exportSheet(shown) {
  const ws = store.settings().weekStartsOn;
  const from = shiftWeek(shown, ws, 0);
  const range = weeks => [from, iso(addDays(fromIso(from), 7 * weeks - 1))];
  const body = `
    <p class="hint">This saves a calendar file (.ics) to import into Apple Calendar, Google Calendar or Outlook. It’s a copy: later changes in TeacherSync don’t reach your calendar until you export and import again. Importing again updates events instead of adding duplicates in calendars that support it.</p>
    <fieldset class="field"><legend>Dates</legend>
      ${RANGES.map(([w, label], i) => { const [a, b] = range(w); return `<label class="check-line"><input type="radio" name="weeks" value="${w}"${i === 0 ? ' checked' : ''}> <span>${label} <span class="muted mono">(${esc(fmtRange(a, b))})</span></span></label>`; }).join('')}
    </fieldset>
    <fieldset class="field"><legend>Include</legend>
      ${KINDS.map(([k, label]) => `<label class="check-line"><input type="checkbox" name="kind" value="${k}" checked> <span>${label} <span class="muted" data-count="${k}"></span></span></label>`).join('')}
    </fieldset>
    <p class="hint">Lesson plans, assignments and tasks without a date aren’t included, nor are finished tasks or grading deadlines of graded work. Only names, rooms and statuses are exported; notes and instructions stay in TeacherSync.</p>
    <p class="note" data-total aria-live="polite"></p>`;
  const choose = form => {
    const [a, b] = range(+form.querySelector('input[name="weeks"]:checked').value);
    const kinds = [...form.querySelectorAll('input[name="kind"]:checked')].map(i => i.value);
    return { from: a, to: b, kinds };
  };
  const sheet = formSheet({
    title: 'Export to calendar',
    submit: 'Download .ics file',
    body,
    onSubmit(form) {
      const { from: a, to: b, kinds } = choose(form);
      const events = calendarEvents(read(), { from: a, to: b, kinds });
      const err = form.querySelector('.form-error');
      if (!events.length) { err.textContent = 'Nothing to export for these choices.'; err.hidden = false; return false; }
      downloadText(icsFileName(a, b), toICS(events), ICS_TYPE);
      toast(`Exported ${plural(events.length, 'event', 'events')}`);
      return true;
    },
  });
  const form = sheet.el.querySelector('form');
  const counts = () => {
    const { from: a, to: b, kinds } = choose(form);
    const all = calendarEvents(read(), { from: a, to: b });
    for (const [k] of KINDS) form.querySelector(`[data-count="${k}"]`).textContent = `(${all.filter(e => e.kind === k).length})`;
    const n = all.filter(e => kinds.includes(e.kind)).length;
    form.querySelector('[data-total]').textContent = `${plural(n, 'event', 'events')} will be exported.`;
    form.querySelector('.form-error').hidden = true;
  };
  form.addEventListener('change', counts);
  counts();
  return sheet;
}
