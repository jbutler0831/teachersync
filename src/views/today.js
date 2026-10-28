// Today: the teacher's home screen. What's on (classes, with that day's lesson plans), what needs attention
// (overdue tasks, grading), what's coming up, and quick actions. It opens on today and can step to any day.
// Everything comes from the store through agenda.js; nothing is kept here except which day is shown.
import { store } from '../data/index.js';
import { dayAgenda, nextClassDay, relativeDay, UPCOMING_DAYS } from '../data/agenda.js';
import { LESSON_STATUS, DAY_OFF_KINDS } from '../data/schema.js';
import { isIsoDate } from '../data/fields.js';
import { iso, fromIso, addDays, fmtLongDate, fmtDay, fmtTime, greeting } from '../lib/dates.js';
import { esc } from '../lib/dom.js';
import { ICONS } from '../lib/icons.js';
import { classForm, dayOffForm } from './classes.js';
import { lessonForm, openLesson } from './lessons.js';
import { assignmentForm, openAssignment, showAssignmentsView } from './assignments.js';

const TICK_MS = 30000;
const SHOW = 5; // items per list before "and N more"
const LESSON_LABEL = Object.fromEntries(LESSON_STATUS);
const KIND_LABEL = Object.fromEntries(DAY_OFF_KINDS);
const UPCOMING_LABEL = { due: 'Due', grade: 'Grade by', task: 'Task', off: 'Day off' };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const hhmm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const short = date => fmtDay(fromIso(date));
/** "Thursday, January 1", plus the year when it isn't this year. */
const longDate = (date, today) => fmtLongDate(fromIso(date)) + (date.slice(0, 4) !== today.slice(0, 4) ? `, ${date.slice(0, 4)}` : '');
const more = (list, item) => `${list.slice(0, SHOW).map(item).join('')}${list.length > SHOW ? `<li class="more">and ${list.length - SHOW} more</li>` : ''}`;

export function render(container) {
  container.innerHTML = `<section class="view today"><div data-paint></div><p class="sr" aria-live="polite" data-announce></p></section>`;
  const el = container.querySelector('section.view');
  const state = { clock: new Date(), selected: null };
  state.today = iso(state.clock);
  state.selected = state.today;
  let shownKey = '';

  const read = () => ({
    classes: store.all('classes'), daysOff: store.all('daysOff'), lessons: store.all('lessons'),
    assignments: store.all('assignments'), tasks: store.all('tasks'), settings: store.settings(),
  });

  const paint = () => {
    // Put focus back where it was, since the page is redrawn (a store change, the clock, a new day).
    const f = document.activeElement;
    const key = f && el.contains(f) ? (f.dataset.day && `[data-day="${f.dataset.day}"]`) || (f.dataset.act && `[data-act="${f.dataset.act}"]`) || (f.getAttribute('href') && `a[href="${f.getAttribute('href')}"]`) : null;
    const data = read();
    const agenda = dayAgenda(state.selected, data, { today: state.today, now: hhmm(state.clock) });
    shownKey = keyOf(agenda, state);
    el.querySelector('[data-paint]').innerHTML = page(agenda, data, state);
    if (key) (el.querySelector(key) || el.querySelector('h1')).focus({ preventScroll: true });
  };

  const show = date => {
    state.selected = date;
    paint();
    const a = dayAgenda(date, read(), { today: state.today });
    el.querySelector('[data-announce]').textContent = `${longDate(date, state.today)}. ${relativeDay(date, state.today)}. ${summary(a, read())}`;
  };

  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const step = { prev: -1, next: 1 }[b.dataset.day];
    if (step) show(iso(addDays(fromIso(state.selected), step)));
    else if (b.dataset.day === 'today') { show(state.today); el.querySelector('h1').focus(); }
    else if (b.dataset.day === 'go') show(b.dataset.date);
    else if (b.dataset.act === 'add-class') classForm();
    else if (b.dataset.act === 'add-off') dayOffForm(null, { start: state.selected });
    else if (b.dataset.act === 'new-lesson') lessonForm({ initial: { date: state.selected } });
    else if (b.dataset.act === 'plan') lessonForm({ initial: { classId: b.dataset.class, date: state.selected } });
    else if (b.dataset.lesson) openLesson(b.dataset.lesson);
    else if (b.dataset.assignment) openAssignment(b.dataset.assignment);
    else if (b.dataset.act === 'new-assignment') assignmentForm({ initial: { assigned: state.selected } });
    else if (b.dataset.act === 'see-grading') showAssignmentsView('attention');
  });
  el.addEventListener('change', e => {
    if (e.target.dataset.day === 'pick' && isIsoDate(e.target.value)) show(e.target.value);
  });

  // Keeps "today", "now" and "next" right while the app stays open, including past midnight.
  // If today was shown, the new day is shown; another chosen day stays.
  const tick = () => {
    if (!el.isConnected) { clearInterval(timer); document.removeEventListener('visibilitychange', tick); return; }
    const clock = new Date(), today = iso(clock);
    if (today !== state.today && state.selected === state.today) state.selected = today;
    Object.assign(state, { clock, today });
    const agenda = dayAgenda(state.selected, read(), { today, now: hhmm(clock) });
    if (keyOf(agenda, state) !== shownKey) paint();
  };
  const timer = setInterval(tick, TICK_MS);
  document.addEventListener('visibilitychange', tick);
  const off = store.subscribe(() => { if (!el.isConnected) off(); else paint(); });
  paint();
}

// What the clock can change on screen: the day, and which class is done, on now, or next.
const keyOf = (a, s) => `${s.today}|${s.selected}|${a.schedule.map(x => x.when).join()}|${a.toGrade.map(x => x.late).join()}|${a.pastDue.length}`;

/** "3 classes, next up Biology 1 at 10:00 AM. 2 to grade." */
function summary(a, data) {
  const parts = [];
  const where = a.isToday ? ' today' : '';
  if (!data.classes.length) parts.push('No classes set up yet.');
  else if (a.dayOff) parts.push(`No classes${where}: ${a.dayOff.title}.`);
  else if (!a.schedule.length) parts.push(`No classes meet${a.isToday ? ' today' : ' on this day'}.`);
  else {
    const n = plural(a.schedule.length, 'class', 'classes');
    if (a.current) parts.push(`${n}. ${a.current.class.name} is on now.`);
    else if (a.next) parts.push(`${n}, ${a.next === a.schedule[0] ? 'the first' : 'next up'}: ${a.next.class.name} at ${fmtTime(a.next.meeting.start)}.`);
    else if (a.isToday) parts.push(`${n}, all done for the day.`);
    else parts.push(`${n}, the first at ${fmtTime(a.schedule[0].meeting.start)}.`);
  }
  const work = [
    a.overdue.length && plural(a.overdue.length, 'overdue task', 'overdue tasks'),
    a.tasksDue.length && plural(a.tasksDue.length, 'task due', 'tasks due'),
    a.pastDue.length && `${a.pastDue.length} past due`,
    a.dueOn.length && `${a.dueOn.length} due`,
    a.toGrade.length && `${a.toGrade.length} to grade`,
  ].filter(Boolean);
  if (work.length) parts.push(`${work.join(', ').replace(/^./, c => c.toUpperCase())}.`);
  return parts.join(' ');
}

function page(a, data, s) {
  const hasWork = data.lessons.length || data.assignments.length || data.tasks.length;
  const head = `<header class="view-head">
    <p class="eyebrow">${esc(a.isToday ? fmtLongDate(fromIso(s.today)) : `Today is ${fmtLongDate(fromIso(s.today))}`)}</p>
    <h1 tabindex="-1">${esc(a.isToday ? `${greeting(s.clock)}.` : longDate(a.date, s.today))}</h1>
    <p class="lede">${esc(data.classes.length || hasWork ? summary(a, data) : 'Your classes, today’s lessons, what needs grading and your tasks, all on one screen.')}</p>
  </header>`;

  // A first start: one clear next step.
  if (!data.classes.length && !hasWork) {
    return `${head}
      <div class="panel empty">
        <div class="empty-icon">${ICONS.classes}</div>
        <h2>Start with your classes</h2>
        <p>Add the classes you teach and when they meet. Then Today shows each period, the days school is out, and what’s coming up.</p>
        <div class="row-btns">
          <button class="btn primary" type="button" data-act="add-class">Add your first class</button>
          <a class="btn" href="#/classes">Open Classes & schedule</a>
        </div>
      </div>`;
  }
  const side = [attentionPanel(a, data), upcomingPanel(a, data), quickPanel(a)].filter(Boolean).join('');
  return `${head}${dayNav(a, s)}
    <div class="today-grid">
      <div class="today-main">${schedulePanel(a, data)}</div>
      <div class="today-side">${side}</div>
    </div>`;
}

function dayNav(a, s) {
  const prev = iso(addDays(fromIso(a.date), -1)), next = iso(addDays(fromIso(a.date), 1));
  return `<nav class="day-nav${a.isToday ? '' : ' is-other'}" aria-label="Choose a day">
    <button class="icon-btn" type="button" data-day="prev" aria-label="Previous day, ${esc(longDate(prev, s.today))}" title="Previous day">‹</button>
    <p class="day-label"><b class="mono">${esc(short(a.date))}</b> <span class="badge${a.isToday ? '' : ' other'}">${esc(relativeDay(a.date, s.today))}</span></p>
    <button class="icon-btn" type="button" data-day="next" aria-label="Next day, ${esc(longDate(next, s.today))}" title="Next day">›</button>
    ${a.isToday ? '' : '<button class="btn" type="button" data-day="today">Back to today</button>'}
    <label class="day-jump"><span class="sr">Go to a date</span><input class="field-in" type="date" data-day="pick" value="${esc(a.date)}"></label>
  </nav>`;
}

function schedulePanel(a, data) {
  const head = `<div class="panel-head"><h2>${a.isToday ? 'Today’s classes' : 'Classes'}</h2>${a.schedule.length ? `<span class="count">${a.schedule.length}</span>` : ''}
    <a class="head-link" href="#/classes">Classes & schedule</a></div>`;
  let body;
  if (!data.classes.length) {
    body = `<p class="note">No classes yet. Add the classes you teach to see them here each day.</p>
      <div><button class="btn primary" type="button" data-act="add-class">Add a class</button></div>`;
  } else if (a.schedule.length) {
    body = `<ol class="slots">${a.schedule.map(x => slot(x, a, data)).join('')}</ol>`;
  } else {
    const nxt = nextClassDay(a.date, data);
    const off = a.dayOff;
    body = `${off ? `<div class="off-banner" role="note"><b>No classes · ${esc(off.title)}</b>
        <span>${esc(KIND_LABEL[off.kind])} · <span class="mono">${esc(off.start === off.end ? short(off.start) : `${short(off.start)} – ${short(off.end)}`)}</span></span></div>`
      : `<p class="note">No classes meet ${a.isToday ? 'today' : 'on this day'}.</p>`}
      ${nxt ? `<p class="next-class">Next class: <b>${esc(nxt.first.class.name)}</b> at ${esc(fmtTime(nxt.first.meeting.start))}, <span class="mono">${esc(short(nxt.date))}</span>
        <button class="btn" type="button" data-day="go" data-date="${esc(nxt.date)}">Show that day</button></p>` : ''}`;
  }
  const others = a.otherLessons.length ? `<div class="panel-body other-lessons"><h3>Other lesson plans for this day</h3>
      <ul>${a.otherLessons.map(x => `<li><button class="lesson-chip" type="button" data-lesson="${esc(x.lesson.id)}">${lessonLine(x.lesson)} <span class="muted">· ${esc(x.class ? x.class.name : 'Missing class')}</span></button></li>`).join('')}</ul></div>` : '';
  return `<div class="panel" id="todayClasses">${head}<div class="panel-body">${body}</div>${others}</div>`;
}

const lessonLine = l => `<b>${esc(l.title)}</b> <span class="status s-${esc(l.status)}">${esc(LESSON_LABEL[l.status])}</span>`;

function slot(x, a, data) {
  const c = x.class;
  const isNext = a.next === x;
  const meta = [c.subject, c.room && `Room ${c.room}`].filter(Boolean).join(' · ');
  return `<li class="slot${x.when ? ` is-${x.when}` : ''}" style="--c: var(--${esc(c.color)})">
    <div class="slot-time mono"><span>${esc(fmtTime(x.meeting.start))}</span><span>${esc(fmtTime(x.meeting.end))}</span></div>
    <div class="slot-main">
      <h3>${esc(c.name)}${x.when === 'now' ? ' <span class="badge">Now</span>' : isNext ? ' <span class="badge next">Next</span>' : ''}${x.when === 'done' ? '<span class="sr"> (finished)</span>' : ''}</h3>
      ${meta ? `<p class="slot-meta">${esc(meta)}</p>` : ''}
      ${x.lessons.map(l => `<button class="lesson-chip" type="button" data-lesson="${esc(l.id)}" aria-label="Lesson plan: ${esc(l.title)}, ${esc(LESSON_LABEL[l.status])}. Open">${lessonLine(l)}</button>`).join('')}
      ${x.lessons.length ? '' : `<p class="slot-lesson none">No lesson plan <button class="btn chip" type="button" data-act="plan" data-class="${esc(c.id)}" aria-label="Plan a lesson for ${esc(c.name)}">Plan a lesson</button></p>`}
      ${c.notes ? `<p class="slot-notes">${esc(c.notes)}</p>` : ''}
    </div>
  </li>`;
}

function attentionPanel(a, data) {
  const hasWork = data.lessons.length || data.assignments.length || data.tasks.length;
  const head = '<div class="panel-head"><h2>Needs attention</h2></div>';
  if (!hasWork) {
    return `<div class="panel attention">${head}<div class="panel-body"><p class="note">Nothing waiting. Add assignments to see what’s due and what needs grading here. Tasks are coming in the next update.</p></div></div>`;
  }
  const group = (title, list, item, cls = '', extra = '') => list.length ? `<div class="att-group${cls}"><h3>${title} <span class="count">${list.length}</span></h3><ul>${more(list, item)}</ul>${extra}</div>` : '';
  const task = t => `<li><b>${esc(t.title)}</b>${t.priority === 'high' ? ' <span class="status s-high">High</span>' : ''}<span class="muted"> · due <span class="mono">${esc(short(t.due))}</span></span></li>`;
  // An assignment that opens when tapped: its title, class and a date (`meta`), then any warning (`flag`).
  const asg = (x, meta = '', flag = '') => `<li><button class="lesson-chip" type="button" data-assignment="${esc(x.assignment.id)}">
    <b>${esc(x.assignment.title)}</b><span class="muted">${x.class ? ` · ${esc(x.class.name)}` : ''}${meta}</span>${flag}</button></li>`;
  const grade = x => asg(x, x.assignment.gradeBy ? ` · grade by <span class="mono">${esc(short(x.assignment.gradeBy))}</span>` : '',
    x.late ? ' <span class="status s-late">Late</span>' : '');
  const pastDue = x => asg(x, ` · was due <span class="mono">${esc(short(x.assignment.due))}</span>`, ' <span class="status s-late">Past due</span>');
  const groups = [
    group('Overdue tasks', a.overdue, task, ' crit'),
    group(a.isToday ? 'Tasks due today' : 'Tasks due this day', a.tasksDue, task),
    group('Past due, not collected', a.pastDue, pastDue, ' crit'),
    group(a.isToday ? 'Assignments due today' : 'Assignments due this day', a.dueOn, x => asg(x, '')),
    // The grading pile is what's waiting now, not tied to the day shown; it says so on other days.
    group(`To grade${a.isToday ? '' : ' <span class="muted small">· now, all classes</span>'}`, a.toGrade, grade, '',
      '<button class="btn chip see-all" type="button" data-act="see-grading">See all in Assignments</button>'),
    a.draftLessons ? `<p class="note small">${plural(a.draftLessons, 'lesson plan', 'lesson plans')} for ${a.isToday ? 'today' : 'this day'} ${a.draftLessons === 1 ? 'is' : 'are'} still a draft.</p>` : '',
  ].filter(Boolean);
  return `<div class="panel attention">${head}<div class="panel-body stack">${groups.length ? groups.join('') : `<p class="note">Nothing overdue or waiting to be graded${a.isToday ? '' : ' for this day'}.</p>`}</div></div>`;
}

function upcomingPanel(a, data) {
  if (!data.assignments.length && !data.tasks.length && !data.daysOff.length) return '';
  const label = u => `<span class="mono when">${esc(short(u.date))}</span> <span class="kind k-${u.kind}">${UPCOMING_LABEL[u.kind]}</span> <b>${esc(u.title)}</b>${u.class ? `<span class="muted"> · ${esc(u.class.name)}</span>` : ''}`;
  const item = u => (u.kind === 'due' || u.kind === 'grade')
    ? `<li><button class="up-open" type="button" data-assignment="${esc(u.id)}">${label(u)}</button></li>` : `<li>${label(u)}</li>`;
  return `<div class="panel upcoming"><div class="panel-head"><h2>Next ${UPCOMING_DAYS} days</h2></div><div class="panel-body">
    ${a.upcoming.length ? `<ul class="up-list">${more(a.upcoming, item)}</ul>` : `<p class="note">Nothing due and no days off in the ${UPCOMING_DAYS} days after ${a.isToday ? 'today' : 'this day'}.</p>`}
  </div></div>`;
}

function quickPanel(a) {
  return `<div class="panel quick"><div class="panel-head"><h2>Quick actions</h2></div><div class="panel-body stack">
    <div class="quick-btns">
      <button class="btn" type="button" data-act="new-lesson">New lesson plan${a.isToday ? '' : ` for ${esc(short(a.date))}`}</button>
      <button class="btn" type="button" data-act="new-assignment">New assignment</button>
      <button class="btn" type="button" data-act="add-class">Add a class</button>
      <button class="btn" type="button" data-act="add-off">Add a day off${a.isToday ? '' : ` on ${esc(short(a.date))}`}</button>
      <a class="btn" href="#/classes">Classes & schedule</a>
    </div>
    <p class="note small">Adding tasks comes with the Tasks section.</p>
  </div></div>`;
}
