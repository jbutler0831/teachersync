import { fmtLongDate, greeting, iso, fmtTime } from '../lib/dates.js';
import { esc } from '../lib/dom.js';
import { store } from '../data/index.js';
import { meetingsOn, dayOffOn } from '../data/schedule.js';
import { viewHead, emptyCard } from './placeholder.js';

export function render(el, now = new Date()) {
  el.innerHTML = `<section class="view">
    ${viewHead({
      eyebrow: fmtLongDate(now),
      title: `${greeting(now)}.`,
      lede: 'Your classes, today’s lessons, what needs grading and your tasks, all on one screen.',
    })}
    <div id="todayClasses"></div>
  </section>`;
  const view = el.querySelector('section.view');
  const paint = () => { view.querySelector('#todayClasses').innerHTML = classesToday(iso(now)); };
  const off = store.subscribe(() => { if (!view.isConnected) off(); else paint(); });
  paint();
}

function classesToday(date) {
  const data = { classes: store.all('classes'), daysOff: store.all('daysOff'), settings: store.settings() };
  if (!data.classes.length) {
    return emptyCard({
      icon: 'classes',
      heading: 'Start with your classes',
      body: 'Add the classes you teach and when they meet. Then Today shows each period with its lesson, plus grading and tasks that are due.',
      action: { href: '#/classes', label: 'Set up classes' },
    });
  }
  const off = dayOffOn(date, data.daysOff);
  const meetings = meetingsOn(date, data);
  const body = off ? `<p class="note">No classes today: <strong>${esc(off.title)}</strong>.</p>`
    : meetings.length ? `<ul class="today-list">${meetings.map(x => `<li style="--c: var(--${esc(x.class.color)})">
        <span class="mono">${esc(fmtTime(x.meeting.start))}–${esc(fmtTime(x.meeting.end))}</span>
        <b>${esc(x.class.name)}</b>${x.class.room ? `<span class="room">Room ${esc(x.class.room)}</span>` : ''}</li>`).join('')}</ul>`
    : '<p class="note">No classes meet today.</p>';
  return `<div class="panel">
    <div class="panel-head"><h2>Today’s classes</h2><a class="head-link" href="#/classes">Classes & schedule</a></div>
    <div class="panel-body">${body}</div>
  </div>`;
}
