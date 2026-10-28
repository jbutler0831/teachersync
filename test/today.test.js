// The Today dashboard, through the screen, with the real store and localStorage.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeSystemTheme, resetDom } from './helpers.js';
import { store } from '../src/data/index.js';
import { initTheme } from '../src/lib/theme.js';
import { mountShell } from '../src/shell.js';
import { startRouter, hrefFor } from '../src/router.js';

let stop;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const click = el => { if (!el) throw new Error('nothing to click'); el.click(); };
const day = d => click($(`[data-day="${d}"]`));
const h1 = () => $('h1').textContent;
const label = () => $('.day-label').textContent.replace(/\s+/g, ' ').trim();
const names = () => $$('.slot h3').map(h => h.firstChild.textContent.trim());
// Text with a space between elements (textContent runs them together).
const words = el => { const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const parts = []; while (w.nextNode()) parts.push(w.currentNode.textContent); return parts.join(' ').replace(/\s+/g, ' '); };
const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };

function open(at) {
  vi.setSystemTime(at);
  const shell = mountShell(document.getElementById('app'));
  location.hash = hrefFor('today');
  stop = startRouter((r, opts) => shell.show(r, opts));
}
function seedClasses() {
  const bio = store.create('classes', { name: 'Biology 1', subject: 'Science', room: '204', notes: 'Lab coats on Fridays', color: 's3',
    meetings: [1, 3, 5].map(d => ({ day: d, start: '10:00', end: '10:50' })) }).record;
  const home = store.create('classes', { name: 'Homeroom', meetings: [1, 2, 3, 4, 5].map(d => ({ day: d, start: '07:30', end: '07:50' })) }).record;
  return { bio, home };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(new Date(2026, 10, 23, 9, 0));
  resetDom();
  fakeSystemTheme(false);
  initTheme();
});
afterEach(() => { stop && stop(); stop = null; vi.useRealTimers(); });

describe('first start', () => {
  it('one clear next step, and no empty panels or day controls', () => {
    open(new Date(2026, 10, 23, 9, 0));
    expect(h1()).toBe('Good morning.');
    expect($('.view-head .eyebrow').textContent).toBe('Monday, November 23');
    expect($('#view').textContent).toContain('Start with your classes');
    expect($('.day-nav')).toBeNull();
    expect($('.attention')).toBeNull();
    click($('[data-act="add-class"]'));
    expect($('dialog.form-sheet h2').textContent).toBe('Add a class');
  });

  it('adding a class from Today shows it at once, and it’s saved', () => {
    open(new Date(2026, 10, 23, 9, 0));
    click($('[data-act="add-class"]'));
    const f = $('dialog.form-sheet form');
    set(f.elements.name, 'Biology 1');
    const row = f.querySelector('[data-row]');
    row.querySelector('input[value="1"]').checked = true;
    set(row.querySelector('[data-start]'), '10:00');
    set(row.querySelector('[data-end]'), '10:50');
    click(f.querySelector('[data-submit]'));
    expect(names()).toEqual(['Biology 1']);
    expect(JSON.parse(localStorage.getItem('tsync-classes'))[0].name).toBe('Biology 1');
  });
});

describe('today’s classes', () => {
  beforeEach(() => { seedClasses(); open(new Date(2026, 10, 23, 9, 0)); });

  it('in time order with times, room, subject and notes; finished, now and next are marked', () => {
    expect(names()).toEqual(['Homeroom', 'Biology 1']);
    const [home, bio] = $$('.slot');
    expect(home.classList.contains('is-done')).toBe(true);
    expect(home.textContent).toContain('(finished)');
    expect(bio.querySelector('.badge').textContent).toBe('Next');
    expect(bio.textContent).toMatch(/10:00 AM\s*10:50 AM/);
    expect(bio.textContent).toContain('Science · Room 204');
    expect(bio.textContent).toContain('Lab coats on Fridays');
    expect($('.lede').textContent).toBe('2 classes, next up: Biology 1 at 10:00 AM.');
    expect(label()).toBe('Mon, Nov 23 Today');
  });

  it('follows the clock: a class becomes Now, then done', () => {
    vi.advanceTimersByTime(65 * 60000); // 10:05
    expect($$('.slot')[1].querySelector('.badge').textContent).toBe('Now');
    expect($('.lede').textContent).toBe('2 classes. Biology 1 is on now.');
    vi.advanceTimersByTime(60 * 60000); // 11:05
    expect($('.lede').textContent).toBe('2 classes, all done for the day.');
  });

  it('honest about what isn’t built yet', () => {
    expect($('.attention').textContent).toMatch(/Add assignments or tasks to see what’s due/);
    expect($('.attention .count')).toBeNull();
    expect($('.upcoming')).toBeNull(); // nothing that could be coming up exists
    expect($('.quick').textContent).toMatch(/Add a class.*Add a day off.*Classes & schedule/s);
    expect($('.quick').textContent).not.toMatch(/Add a task|Add an assignment|lesson plan…/i);
  });
});

describe('moving between days', () => {
  beforeEach(() => { seedClasses(); open(new Date(2026, 10, 23, 9, 0)); });

  it('next and previous update the heading, the label, the classes and the summary', () => {
    $('[data-day="next"]').focus(); // as with the keyboard: focus stays on the button through the redraw
    day('next');
    expect(h1()).toBe('Tuesday, November 24');
    expect($('.view-head .eyebrow').textContent).toBe('Today is Monday, November 23');
    expect(label()).toBe('Tue, Nov 24 Tomorrow');
    expect($('.day-nav').classList.contains('is-other')).toBe(true);
    expect(names()).toEqual(['Homeroom']);
    expect($('.slot.is-done')).toBeNull(); // only today has done/now/next
    expect($('[data-announce]').textContent).toMatch(/^Tuesday, November 24\. Tomorrow\. 1 class/);
    expect(document.activeElement).toBe($('[data-day="next"]'));
    day('prev'); day('prev');
    expect(label()).toBe('Sun, Nov 22 Yesterday');
    expect($('.lede').textContent).toBe('No classes meet on this day.');
    expect($('.next-class').textContent).toMatch(/Next class: Homeroom at 7:30 AM, Mon, Nov 23/);
    day('today');
    expect(h1()).toBe('Good morning.');
    expect($('[data-day="today"]')).toBeNull();
    expect(document.activeElement).toBe($('h1'));
  });

  it('“Show that day” and the date picker jump to a day', () => {
    day('prev');
    click($('[data-day="go"]'));
    expect(label()).toBe('Mon, Nov 23 Today');
    set($('[data-day="pick"]'), '2026-12-04');
    expect(h1()).toBe('Friday, December 4');
    expect(label()).toBe('Fri, Dec 4 In 11 days');
    set($('[data-day="pick"]'), '');               // a cleared picker changes nothing
    expect(h1()).toBe('Friday, December 4');
  });

  it('a day off shows its name instead of classes, and the next class after it', () => {
    store.create('daysOff', { title: 'Thanksgiving break', start: '2026-11-25', end: '2026-11-27', kind: 'break' });
    day('next'); day('next');
    expect($('.off-banner').textContent).toMatch(/No classes · Thanksgiving break.*Break.*Wed, Nov 25 – Fri, Nov 27/s);
    expect($$('.slot')).toEqual([]);
    expect($('.lede').textContent).toBe('No classes: Thanksgiving break.');
    expect($('.next-class').textContent).toMatch(/Homeroom at 7:30 AM, Mon, Nov 30/);
  });
});

describe('month and year boundaries', () => {
  it('Oct 31 → Nov 1 and back', () => {
    seedClasses();
    open(new Date(2026, 9, 31, 12));
    day('next');
    expect(h1()).toBe('Sunday, November 1');
    day('prev'); day('prev');
    expect(h1()).toBe('Friday, October 30');
    expect(names()).toEqual(['Homeroom', 'Biology 1']);
  });

  it('Dec 31 → Jan 1 shows the new year, and Feb 28 → 29 in a leap year', () => {
    seedClasses();
    open(new Date(2026, 11, 31, 12));
    day('next');
    expect(h1()).toBe('Friday, January 1, 2027');
    expect(label()).toBe('Fri, Jan 1 Tomorrow');
    expect($('[data-day="prev"]').getAttribute('aria-label')).toBe('Previous day, Thursday, December 31');
    set($('[data-day="pick"]'), '2028-02-28');
    day('next');
    expect(h1()).toBe('Tuesday, February 29, 2028');
    day('next');
    expect(h1()).toBe('Wednesday, March 1, 2028');
  });

  it('past midnight, Today moves to the new day; a day the teacher chose stays', () => {
    seedClasses();
    open(new Date(2026, 11, 31, 23, 59));
    expect(h1()).toBe('Good evening.');
    vi.advanceTimersByTime(2 * 60000);
    expect($('.view-head .eyebrow').textContent).toBe('Friday, January 1');
    expect(label()).toBe('Fri, Jan 1 Today');
    day('next');                                       // Jan 2
    vi.advanceTimersByTime(24 * 3600000);              // the next midnight
    expect(label()).toBe('Sat, Jan 2 Today');          // still Jan 2, which is now today
  });
});

describe('workload, from the data that exists', () => {
  let bio;
  beforeEach(() => {
    ({ bio } = seedClasses());
    store.create('lessons', { classId: bio.id, date: '2026-11-23', title: 'Cells', status: 'ready' });
    store.create('lessons', { classId: bio.id, date: '2026-11-24', title: 'Planned on a Tuesday', status: 'draft' });
    store.create('tasks', { title: 'Overdue copies', due: '2026-11-20' });
    store.create('tasks', { title: 'Email office', due: '2026-11-23', priority: 'high' });
    store.create('tasks', { title: 'Tomorrow task', due: '2026-11-24' });
    const done = store.create('tasks', { title: 'Done already', due: '2026-11-20' }).record;
    store.update('tasks', done.id, { done: true });
    store.create('assignments', { classId: bio.id, title: 'Lab report', due: '2026-11-18', gradeBy: '2026-11-21', status: 'to-grade' });
    store.create('assignments', { classId: bio.id, title: 'Essay', due: '2026-11-26' });
    store.create('daysOff', { title: 'Thanksgiving', start: '2026-11-26', end: '2026-11-27' });
    open(new Date(2026, 10, 23, 9, 0));
  });

  it('shows each class’s lesson plan, overdue and due tasks, grading, and what’s coming up', () => {
    expect($$('.slot')[1].textContent).toMatch(/Cells\s*Planned/);
    expect($$('.slot')[0].textContent).toMatch(/No lesson plan\s*Plan a lesson/);
    const att = words($('.attention'));
    expect(att).toMatch(/Overdue tasks 1 Overdue copies · due Fri, Nov 20/);
    expect(att).toMatch(/Tasks due today 1 Email office High/);
    expect(att).toMatch(/To grade 1 Lab report · Biology 1 · grade by Sat, Nov 21 Late/);
    expect(att).not.toContain('Done already');
    expect($('.lede').textContent).toBe('2 classes, next up: Biology 1 at 10:00 AM. 1 overdue task, 1 task due, 1 to grade.');
    expect($$('.up-list li').map(li => li.textContent.replace(/\s+/g, ' ').trim())).toEqual([
      'Tue, Nov 24 Task Tomorrow task', 'Thu, Nov 26 Due Essay · Biology 1', 'Thu, Nov 26 Day off Thanksgiving',
    ]);
  });

  it('on another day: that day’s tasks and lessons; overdue only belongs to today', () => {
    day('next');
    const att = words($('.attention'));
    expect(att).not.toContain('Overdue');
    expect(att).toMatch(/Tasks due this day 1 Tomorrow task/);
    expect(att).toMatch(/To grade · now, all classes 1/);
    expect(att).toMatch(/1 lesson plan for this day is still a draft/);
    // Biology doesn't meet on Tuesdays, so its lesson plan is listed on its own.
    expect($('.other-lessons').textContent).toMatch(/Planned on a Tuesday\s*Draft\s*· Biology 1/);
  });

  it('updates when the data changes, and the change is saved', () => {
    const t = store.all('tasks').find(x => x.title === 'Email office');
    store.update('tasks', t.id, { done: true });
    expect($('.attention').textContent).not.toContain('Email office');
    expect(JSON.parse(localStorage.getItem('tsync-tasks')).find(x => x.id === t.id).done).toBe(true);
  });

  it('quick action: a day off on the shown day, filled in, then shown', () => {
    day('next');
    click($('[data-act="add-off"]'));
    const f = $('dialog.form-sheet form');
    expect(f.elements.start.value).toBe('2026-11-24');
    set(f.elements.title, 'Teacher workday');
    click(f.querySelector('[data-submit]'));
    expect($('.off-banner').textContent).toContain('Teacher workday');
    expect(store.all('daysOff').map(d => d.start)).toContain('2026-11-24');
  });
});
