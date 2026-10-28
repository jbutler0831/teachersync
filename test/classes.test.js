// Classes & schedule, used the way a teacher would: through the screens, with the real store and localStorage.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeSystemTheme, resetDom } from './helpers.js';
import { store } from '../src/data/index.js';
import { initTheme } from '../src/lib/theme.js';
import { mountShell } from '../src/shell.js';
import { startRouter, hrefFor } from '../src/router.js';

// Monday, November 23, 2026. Thanksgiving is Thursday the 26th.
const MONDAY = new Date(2026, 10, 23, 9, 0);

let stop;
const go = id => { location.hash = hrefFor(id); window.dispatchEvent(new HashChangeEvent('hashchange')); };
const start = (route = 'classes') => {
  const shell = mountShell(document.getElementById('app'));
  location.hash = hrefFor(route);
  stop = startRouter((r, opts) => shell.show(r, opts));
};
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const click = el => { if (!el) throw new Error('nothing to click'); el.click(); };
const act = (name, id) => click($(`[data-act="${name}"]${id ? `[data-id="${id}"]` : ''}`));
const sheet = () => $('dialog.form-sheet');
const submit = () => click(sheet().querySelector('[data-submit]'));
const err = name => sheet().querySelector(`[data-err="${name}"]`);
const set = (el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
const toastAction = () => click($('#toast .toast-act'));

/** Fills the open class form. rows: [{ days: [1, 3], start: '08:00', end: '08:50' }] */
function fillClass({ name, subject, room, notes, rows }) {
  const f = sheet().querySelector('form');
  if (name !== undefined) set(f.elements.name, name);
  if (subject !== undefined) set(f.elements.subject, subject);
  if (room !== undefined) set(f.elements.room, room);
  if (notes !== undefined) set(f.elements.notes, notes);
  if (rows) {
    for (const r of f.querySelectorAll('[data-row]')) r.remove();
    for (const row of rows) {
      click(f.querySelector('[data-add-row]'));
      const el = [...f.querySelectorAll('[data-row]')].pop();
      for (const box of el.querySelectorAll('input[type="checkbox"]')) box.checked = row.days.includes(+box.value);
      set(el.querySelector('[data-start]'), row.start ?? '');
      set(el.querySelector('[data-end]'), row.end ?? '');
    }
  }
}
function addClass(fields) { act('add-class'); fillClass(fields); submit(); }
function addDayOff({ title, start: first, end = '', kind }) {
  act('add-off');
  const f = sheet().querySelector('form');
  set(f.elements.title, title);
  set(f.elements.start, first);
  set(f.elements.end, end);
  if (kind) set(f.elements.kind, kind);
  submit();
}
const rowErrors = () => [...sheet().querySelectorAll('[data-row-err]')].filter(p => !p.hidden).map(p => p.textContent);
const dayCell = label => $$('.week-grid > .day').find(d => d.querySelector('h3').textContent.includes(label));
const BIO = { name: 'Biology 1', subject: 'Science', room: '204', notes: 'Lab coats on Fridays', rows: [{ days: [1, 3, 5], start: '08:00', end: '08:50' }, { days: [2, 4], start: '10:00', end: '11:15' }] };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(MONDAY);
  resetDom();
  fakeSystemTheme(false);
  initTheme();
});
afterEach(() => { stop && stop(); vi.useRealTimers(); });

describe('first visit', () => {
  it('Classes explains what to do and offers to add the first class; Today points there', () => {
    start('today');
    expect($('#todayClasses').textContent).toContain('Start with your classes');
    go('classes');
    expect($('h1').textContent).toBe('Classes & schedule');
    expect($('#classesPanel').textContent).toContain('No classes yet');
    expect($('#schedulePanel').textContent).toBe('');
    expect($('#daysOffPanel').textContent).toMatch(/Add holidays, breaks/);
    act('add-class');
    expect(sheet()).toBeTruthy();
    expect(document.activeElement).toBe(sheet().querySelector('[name="name"]'));
  });
});

describe('adding a class', () => {
  beforeEach(() => start());

  it('saves the name, subject, room, notes and weekly times, and shows them', () => {
    addClass(BIO);
    expect(sheet()).toBeNull();
    const [c] = store.all('classes');
    expect(c).toMatchObject({ name: 'Biology 1', subject: 'Science', room: '204', notes: 'Lab coats on Fridays', color: 's1' });
    expect(c.meetings.map(m => `${m.day} ${m.start}-${m.end}`).sort()).toEqual(['1 08:00-08:50', '2 10:00-11:15', '3 08:00-08:50', '4 10:00-11:15', '5 08:00-08:50']);
    const item = $('.class-item').textContent;
    expect(item).toContain('Science · Room 204');
    expect(item).toMatch(/Mon, Wed, Fri\s+8:00/);
    expect(item).toMatch(/Tue, Thu\s+10:00/);
    expect(item).toContain('Lab coats on Fridays');
    expect($('#toast').textContent).toBe('Added Biology 1');
  });

  it('is still there after reopening the app', () => {
    addClass(BIO);
    stop();
    store.load();
    document.body.innerHTML = '<div id="app"></div>';
    start();
    expect($('.class-item h3').textContent).toBe('Biology 1');
    expect(JSON.parse(localStorage.getItem('tsync-classes'))[0].notes).toBe('Lab coats on Fridays');
  });

  it('a class can be saved without meeting times, and says so', () => {
    addClass({ name: 'Advisory' });
    expect(store.all('classes')[0].meetings).toEqual([]);
    expect($('.class-item').textContent).toContain('No meeting times yet');
  });

  it('each new class gets the next color', () => {
    addClass({ name: 'A' });
    addClass({ name: 'B' });
    expect(store.all('classes').map(c => c.color)).toEqual(['s1', 's2']);
  });
});

describe('form errors', () => {
  beforeEach(() => start());

  it('a missing name is explained and nothing is saved', () => {
    addClass({ name: '   ' });
    expect(sheet()).toBeTruthy();
    expect(err('name').textContent).toBe('Give the class a name');
    expect(sheet().querySelector('[name="name"]').getAttribute('aria-invalid')).toBe('true');
    expect(store.all('classes')).toEqual([]);
    expect(localStorage.getItem('tsync-classes')).toBeNull();
  });

  it('each incomplete time row says what’s missing', () => {
    addClass({ name: 'Art', rows: [{ days: [], start: '09:00', end: '10:00' }, { days: [1], start: '', end: '10:00' }, { days: [2], start: '09:00', end: '' }, { days: [3], start: '10:00', end: '09:00' }] });
    expect(rowErrors()).toEqual(['Pick at least one day', 'Add a start time', 'Add an end time', 'The end time must be after the start time']);
    expect(store.all('classes')).toEqual([]);
  });

  it('shows every problem at once', () => {
    addClass({ name: '', rows: [{ days: [], start: '09:00', end: '10:00' }] });
    expect(err('name').textContent).toBe('Give the class a name');
    expect(rowErrors()).toEqual(['Pick at least one day']);
    expect(document.activeElement).toBe(sheet().querySelector('[name="name"]'));
  });

  it('a row left completely empty is ignored', () => {
    addClass({ name: 'Art', rows: [{ days: [], start: '', end: '' }, { days: [1], start: '09:00', end: '10:00' }] });
    expect(store.all('classes')[0].meetings).toHaveLength(1);
  });

  it('a class can’t meet twice at the same time', () => {
    addClass({ name: 'Art', rows: [{ days: [1, 2], start: '09:00', end: '10:00' }, { days: [2], start: '09:30', end: '10:30' }] });
    expect(err('meetings').textContent).toMatch(/^Tuesday: 9:00.*overlaps 9:30.*can’t meet twice/);
    expect(store.all('classes')).toEqual([]);
  });

  it('the store refuses overlapping times even without the form', () => {
    const res = store.create('classes', { name: 'X', meetings: [{ day: 1, start: '09:00', end: '10:00' }, { day: 1, start: '09:59', end: '11:00' }] });
    expect(res.errors.meetings).toBe('Two meeting times overlap on Monday');
  });
});

describe('overlapping another class', () => {
  beforeEach(() => { start(); addClass(BIO); });

  it('warns, names the other class, and saves only when asked to', () => {
    addClass({ name: 'Chemistry', rows: [{ days: [1], start: '08:30', end: '09:20' }] });
    const box = sheet().querySelector('.clash-box');
    expect(box.hidden).toBe(false);
    expect(box.textContent).toMatch(/Biology 1: Monday 8:00/);
    expect(sheet().querySelector('[data-submit]').textContent).toBe('Save anyway');
    expect(store.all('classes')).toHaveLength(1);
    submit();
    expect(store.all('classes')).toHaveLength(2);
    expect($$('.clash').map(p => p.textContent)).toEqual(['Overlaps Chemistry', 'Overlaps Biology 1']);
  });

  it('changing the times asks again', () => {
    act('add-class');
    fillClass({ name: 'Chemistry', rows: [{ days: [1], start: '08:30', end: '09:20' }] });
    submit();
    set(sheet().querySelector('[data-start]'), '08:40');
    expect(sheet().querySelector('.clash-box').hidden).toBe(true);
    expect(sheet().querySelector('[data-submit]').textContent).toBe('Add class');
    submit();
    expect(store.all('classes')).toHaveLength(1);
  });

  it('back-to-back classes aren’t a conflict', () => {
    addClass({ name: 'Chemistry', rows: [{ days: [1], start: '08:50', end: '09:40' }] });
    expect(sheet()).toBeNull();
    expect(store.all('classes')).toHaveLength(2);
  });
});

describe('editing and deleting', () => {
  let bio;
  beforeEach(() => { start(); addClass(BIO); bio = store.all('classes')[0]; });

  it('edits keep the class and its unchanged meeting times', () => {
    act('edit-class', bio.id);
    expect(sheet().querySelector('h2').textContent).toBe('Edit Biology 1');
    expect(sheet().querySelector('[name="room"]').value).toBe('204');
    expect(sheet().querySelectorAll('[data-row]')).toHaveLength(2);
    set(sheet().querySelector('[name="room"]'), '210');
    click(sheet().querySelectorAll('[data-remove-row]')[1]); // drop Tue/Thu
    submit();
    const after = store.get('classes', bio.id);
    expect(after).toMatchObject({ room: '210', createdAt: bio.createdAt });
    expect(after.meetings.map(m => m.id).sort()).toEqual(bio.meetings.filter(m => m.start === '08:00').map(m => m.id).sort());
    expect($('.class-item').textContent).toContain('Room 210');
    expect($('#toast').textContent).toBe('Class saved');
  });

  it('Cancel changes nothing', () => {
    act('edit-class', bio.id);
    set(sheet().querySelector('[name="name"]'), 'Changed');
    click(sheet().querySelector('[data-cancel]'));
    expect(sheet()).toBeNull();
    expect(store.get('classes', bio.id).name).toBe('Biology 1');
  });

  it('delete asks first; cancelling keeps the class', async () => {
    act('delete-class', bio.id);
    const dlg = $('dialog.sheet');
    expect(dlg.textContent).toContain('Delete Biology 1?');
    click([...dlg.querySelectorAll('button')].find(b => b.textContent === 'Cancel'));
    await Promise.resolve();
    expect(store.all('classes')).toHaveLength(1);
  });

  it('deleting warns about its lessons and assignments, removes them, and Undo brings everything back', async () => {
    store.create('lessons', { classId: bio.id, title: 'Cells', date: '2026-11-23' });
    store.create('assignments', { classId: bio.id, title: 'Lab report' });
    act('delete-class', bio.id);
    const dlg = $('dialog.sheet');
    expect(dlg.textContent).toMatch(/1 lesson plan and 1 assignment will be deleted too/);
    click([...dlg.querySelectorAll('button')].find(b => b.textContent === 'Delete class'));
    await vi.waitFor(() => expect(store.all('classes')).toEqual([]));
    expect(store.all('lessons')).toEqual([]);
    expect($('#classesPanel').textContent).toContain('No classes yet');
    expect($('#toast').textContent).toContain('Deleted Biology 1');
    toastAction();
    expect(store.all('classes')).toHaveLength(1);
    expect(store.all('lessons')).toHaveLength(1);
    expect(store.all('assignments')).toHaveLength(1);
  });
});

describe('days off and the schedule', () => {
  beforeEach(() => { start(); addClass(BIO); });

  it('the schedule shows this week’s classes by day, with dates', () => {
    expect($('.week-label').textContent).toMatch(/Nov 23 – 29/);
    expect(dayCell('Mon').textContent).toMatch(/8:00.*Biology 1/);
    expect(dayCell('Mon').querySelector('.badge').textContent).toBe('Today');
    expect(dayCell('Tue').textContent).toMatch(/10:00.*Biology 1/);
    // No weekend columns when nothing meets then.
    expect(dayCell('Sat')).toBeUndefined();
  });

  it('a break is listed, and classes don’t appear on any of its days', () => {
    addDayOff({ title: 'Thanksgiving break', start: '2026-11-25', end: '2026-11-27', kind: 'break' });
    expect(sheet()).toBeNull();
    expect(store.all('daysOff')[0]).toMatchObject({ title: 'Thanksgiving break', start: '2026-11-25', end: '2026-11-27', kind: 'break' });
    expect($('.off-list').textContent).toMatch(/Thanksgiving break.*Nov 25 – 27.*Break/s);
    for (const d of ['Wed', 'Thu', 'Fri']) {
      expect(dayCell(d).textContent).toContain('No classes · Thanksgiving break');
      expect(dayCell(d).textContent).not.toContain('Biology');
    }
    expect(dayCell('Mon').textContent).toContain('Biology 1');
  });

  it('Today says when there are no classes because of a day off', () => {
    addDayOff({ title: 'Teacher workday', start: '2026-11-23' });
    go('today');
    expect($('#todayClasses').textContent).toContain('No classes today: Teacher workday.');
  });

  it('Today lists today’s classes in order', () => {
    addClass({ name: 'Homeroom', rows: [{ days: [1], start: '07:30', end: '07:50' }] });
    go('today');
    expect($$('.today-list li b').map(b => b.textContent)).toEqual(['Homeroom', 'Biology 1']);
    expect($('.today-list').textContent).toContain('Room 204');
  });

  it('a single day off: the last day can be left empty', () => {
    addDayOff({ title: 'Veterans Day', start: '2026-11-11' });
    expect(store.all('daysOff')[0].end).toBe('2026-11-11');
  });

  it('day off errors: missing name and day, last day first, and a mistyped year', () => {
    addDayOff({ title: '', start: '' });
    expect(err('title').textContent).toMatch(/Give it a name/);
    expect(err('start').textContent).toBe('Choose the first day');
    const f = sheet().querySelector('form');
    set(f.elements.title, 'Winter break');
    set(f.elements.start, '2026-12-21');
    set(f.elements.end, '2026-12-01');
    submit();
    expect(err('end').textContent).toBe('The last day is before the first day');
    set(f.elements.end, '2062-01-01');
    submit();
    expect(err('end').textContent).toMatch(/up to a year/);
    expect(store.all('daysOff')).toEqual([]);
  });

  it('edits and deletes a day off, with Undo', () => {
    addDayOff({ title: 'Thanksgiving', start: '2026-11-26', end: '2026-11-27' });
    const d = store.all('daysOff')[0];
    act('edit-off', d.id);
    const f = sheet().querySelector('form');
    expect(f.elements.end.value).toBe('2026-11-27');
    set(f.elements.end, '');
    submit();
    expect(store.get('daysOff', d.id).end).toBe('2026-11-26');
    expect(dayCell('Fri').textContent).toContain('Biology 1');
    act('delete-off', d.id);
    expect(store.all('daysOff')).toEqual([]);
    expect(dayCell('Thu').textContent).toContain('Biology 1');
    toastAction();
    expect(store.all('daysOff')).toHaveLength(1);
  });

  it('past days off are tucked away; the week can be moved', () => {
    addDayOff({ title: 'Labor Day', start: '2026-09-07' });
    expect($('.past summary').textContent).toBe('Past days off (1)');
    expect($('#daysOffPanel').textContent).toContain('No upcoming days off.');
    act('week');                                   // first [data-act="week"] is Previous
    click($('[data-act="week"][data-to="next"]'));
    click($('[data-act="week"][data-to="next"]'));
    expect($('.week-label').textContent).toMatch(/Nov 30 – Dec 6/);
    click($('[data-act="week"][data-to="today"]'));
    expect($('.week-label').textContent).toMatch(/Nov 23 – 29/);
    expect($('[data-act="week"][data-to="today"]')).toBeNull();
  });

  it('a week that starts on Sunday', () => {
    store.updateSettings({ weekStartsOn: 0 });
    expect($('.week-label').textContent).toMatch(/Nov 22 – 28/);
  });
});
