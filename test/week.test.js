// The Week view and calendar export, through the screens, with the real store and localStorage.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeSystemTheme, resetDom } from './helpers.js';
import { store } from '../src/data/index.js';
import { initTheme } from '../src/lib/theme.js';
import { mountShell } from '../src/shell.js';
import { startRouter, hrefFor } from '../src/router.js';

// Monday, November 23, 2026.
let stop, bio, art;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const click = el => { if (!el) throw new Error('nothing to click'); el.click(); };
const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
const label = () => $('.day-label').textContent.replace(/\s+/g, ' ').trim();
const days = () => $$('.wk-day').map(d => d.querySelector('.wk-head .mono').textContent);
const day = name => $$('.wk-day').find(d => d.querySelector('.wk-head').textContent.includes(name));
const itemsOf = name => [...day(name).querySelectorAll('.wk-item > button, .wk-off')].map(b => b.textContent.replace(/\s+/g, ' ').trim());
const confirmSheet = () => $('dialog.sheet:not(.form-sheet)');
const choose = lbl => click([...confirmSheet().querySelectorAll('button')].find(b => b.textContent === lbl));

function start(route = 'week') {
  const shell = mountShell(document.getElementById('app'));
  location.hash = hrefFor(route);
  stop = startRouter((r, opts) => shell.show(r, opts));
}
function seed() {
  bio = store.create('classes', { name: 'Biology 1', room: '204', color: 's3', meetings: [1, 3, 5].map(d => ({ day: d, start: '10:00', end: '10:50' })) }).record;
  art = store.create('classes', { name: 'Art', color: 's2', meetings: [{ day: 1, start: '08:00', end: '08:50' }] }).record;
  store.create('daysOff', { title: 'Thanksgiving break', start: '2026-11-26', end: '2026-11-27', kind: 'break' });
  store.create('lessons', { classId: bio.id, title: 'Cells', date: '2026-11-23', status: 'ready' });
  store.create('lessons', { classId: bio.id, title: 'Someday plan' });
  store.create('assignments', { classId: bio.id, title: 'Lab report', due: '2026-11-25', gradeBy: '2026-11-28' });
  store.create('tasks', { title: 'Make copies', due: '2026-11-24', priority: 'high' });
  store.create('tasks', { title: 'Undated task' });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 23, 9, 0));
  resetDom();
  fakeSystemTheme(false);
  initTheme();
});
afterEach(() => { stop && stop(); stop = null; vi.useRealTimers(); });

describe('empty', () => {
  it('nothing saved: one clear next step', () => {
    start();
    expect($('h1').textContent).toBe('Week');
    expect($('#view').textContent).toContain('Nothing to show yet');
    click($('[data-act="add-class"]'));
    expect($('dialog.form-sheet h2').textContent).toBe('Add a class');
  });
  it('a week with nothing in it says so', () => {
    store.create('classes', { name: 'No meetings yet' });
    start();
    expect($('#view').textContent).toContain('Nothing scheduled this week');
    expect(days()).toEqual(['Mon, Nov 23', 'Tue, Nov 24', 'Wed, Nov 25', 'Thu, Nov 26', 'Fri, Nov 27']);
  });
});

describe('the week', () => {
  beforeEach(() => { seed(); start(); });

  it('this week, with today marked; weekend only when something is on it', () => {
    expect(label()).toBe('Nov 23 – 29 This week');
    expect(days()).toEqual(['Mon, Nov 23', 'Tue, Nov 24', 'Wed, Nov 25', 'Thu, Nov 26', 'Fri, Nov 27', 'Sat, Nov 28']); // grading deadline on Saturday
    expect(day('Nov 23').classList.contains('is-today')).toBe(true);
  });

  it('each kind of item, labelled in words, in order; classes with their lesson plan', () => {
    expect(itemsOf('Nov 23')).toEqual(['8:00 AM–8:50 AM Art No lesson plan', '10:00 AM–10:50 AM Biology 1 Room 204', 'Lesson plan Cells Planned']);
    expect(day('Nov 23').querySelector('.wk-lesson').textContent.replace(/\s+/g, ' ').trim()).toBe('Lesson plan Cells Planned');
    expect(itemsOf('Nov 24')).toEqual(['Task Make copies High priority']);
    expect(itemsOf('Nov 25')).toEqual(['Due Lab report Biology 1 · Assigned', '10:00 AM–10:50 AM Biology 1 Room 204 · No lesson plan']);
    expect(itemsOf('Nov 28')).toEqual(['Grade by Lab report Biology 1 · Assigned']);
  });

  it('days off: the break, and no classes', () => {
    expect(itemsOf('Nov 26')).toEqual(['Day off Thanksgiving break. No classes.']);
    expect(itemsOf('Nov 27')).toEqual(['Day off Thanksgiving break. No classes.']);
    expect(day('Nov 27').textContent).not.toContain('Biology');
  });

  it('undated plans and tasks aren’t placed on a day; a note links to them', () => {
    expect($('#view').textContent).not.toContain('Someday plan');
    expect($('#view').textContent).not.toContain('Undated task');
    expect($('#view').textContent).toMatch(/Not on the calendar because they have no date:\s*1 open task\s*1 lesson plan/);
  });

  it('next, previous and This week; crossing into the new year; navigation saves nothing', () => {
    const before = JSON.stringify({ ...localStorage });
    $('[data-week="next"]').focus();
    click($('[data-week="next"]'));
    expect(label()).toBe('Nov 30 – Dec 6 Next week');
    expect(document.activeElement).toBe($('[data-week="next"]'));
    expect($('[data-announce]').textContent).toBe('Nov 30 – Dec 6, Next week');
    click($('[data-week="prev"]')); click($('[data-week="prev"]'));
    expect(label()).toBe('Nov 16 – 22 Last week');
    click($('[data-week="this"]'));
    expect(label()).toBe('Nov 23 – 29 This week');
    expect($('[data-week="this"]')).toBeNull();
    set($('[data-week="pick"]'), '2026-12-31');
    expect(label()).toBe('Dec 28, 2026 – Jan 3, 2027 In 5 weeks');
    expect(JSON.stringify({ ...localStorage })).toBe(before);
  });

  it('follows the week-start setting', () => {
    store.updateSettings({ weekStartsOn: 0 });
    expect(label()).toBe('Nov 22 – 28 This week');
    expect(days()[0]).toBe('Sun, Nov 22');
  });

  it('a crowded day shows five, then the rest on request', () => {
    for (let i = 1; i <= 6; i++) store.create('tasks', { title: `Extra ${i}`, due: '2026-11-24' });
    expect(itemsOf('Nov 24')).toHaveLength(5);
    const more = day('Nov 24').querySelector('[data-more]');
    expect([more.textContent, more.getAttribute('aria-expanded')]).toEqual(['Show 2 more', 'false']);
    click(more);
    expect(itemsOf('Nov 24')).toHaveLength(7);
    expect(day('Nov 24').querySelector('[data-more]').textContent).toBe('Show fewer');
  });

  it('changes made elsewhere show up at once, with no duplicates', () => {
    const t = store.all('tasks').find(x => x.title === 'Make copies');
    store.update('tasks', t.id, { due: '2026-11-25', done: true });
    expect(itemsOf('Nov 24')).toEqual([]);
    expect(itemsOf('Nov 25')[1]).toBe('Task Make copies Done');
    expect($$('.wk-item').filter(li => li.textContent.includes('Make copies'))).toHaveLength(1);
  });
});

describe('opening things', () => {
  beforeEach(() => { seed(); start(); });

  it('a class meeting: its lesson plan, or Plan a lesson for that day', async () => {
    click(day('Nov 23').querySelectorAll('[data-open="class"]')[1]);
    expect(confirmSheet().textContent).toMatch(/Biology 1.*Monday, November 23 · 10:00 AM–10:50 AM.*Lesson plan: Cells \(Planned\)/s);
    choose('Open lesson plan');
    await vi.waitFor(() => expect(confirmSheet()?.querySelector('h2').textContent).toBe('Cells'));
    choose('Close');
    await vi.waitFor(() => expect(confirmSheet()).toBeNull());
    click(day('Nov 25').querySelector('[data-open="class"]'));
    choose('Plan a lesson');
    await vi.waitFor(() => expect($('dialog.form-sheet')).toBeTruthy());
    const f = $('dialog.form-sheet form');
    expect([f.elements.classId.value, f.elements.date.value]).toEqual([bio.id, '2026-11-25']);
  });

  it('lesson plans, assignments, tasks and days off open their own sheets', () => {
    click(day('Nov 23').querySelector('.wk-lesson'));
    expect(confirmSheet().querySelector('h2').textContent).toBe('Cells');
    confirmSheet().remove();
    click(day('Nov 25').querySelector('[data-open="due"]'));
    expect(confirmSheet().querySelector('h2').textContent).toBe('Lab report');
    confirmSheet().remove();
    click(day('Nov 28').querySelector('[data-open="grade"]'));
    expect(confirmSheet().querySelector('h2').textContent).toBe('Lab report');
    confirmSheet().remove();
    click(day('Nov 24').querySelector('[data-open="task"]'));
    expect(confirmSheet().querySelector('h2').textContent).toBe('Make copies');
    confirmSheet().remove();
    click(day('Nov 26').querySelector('[data-open="off"]'));
    expect($('dialog.form-sheet h2').textContent).toBe('Edit Thanksgiving break');
  });

  it('a day heading opens that day in Today', async () => {
    click(day('Nov 25').querySelector('[data-day]'));
    await vi.waitFor(() => expect($('.view-head h1').textContent).toBe('Wednesday, November 25'));
  });
});

describe('export', () => {
  let blobs, names;
  beforeEach(() => {
    seed();
    blobs = []; names = [];
    URL.createObjectURL = vi.fn(b => { blobs.push(b); return 'blob:x'; });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { names.push(this.download); });
    start();
  });
  afterEach(() => vi.restoreAllMocks());
  const sheet = () => $('dialog.form-sheet');
  const counts = () => Object.fromEntries([...sheet().querySelectorAll('[data-count]')].map(s => [s.dataset.count, s.textContent]));

  it('explains it’s a file, not a sync; shows what each choice includes', () => {
    click($('[data-act="export"]'));
    expect(sheet().textContent).toMatch(/It’s a copy: later changes in TeacherSync don’t reach your calendar/);
    // Biology's Friday class falls in the break, so 3 class meetings.
    expect(counts()).toEqual({ class: '(3)', lesson: '(1)', due: '(1)', grade: '(1)', task: '(1)', off: '(1)' });
    expect(sheet().querySelector('[data-total]').textContent).toBe('8 events will be exported.');
    sheet().querySelector('input[name="kind"][value="class"]').click();
    expect(sheet().querySelector('[data-total]').textContent).toBe('5 events will be exported.');
    sheet().querySelector('input[name="weeks"][value="4"]').click();
    expect(sheet().textContent).toMatch(/4 weeks, from the week shown \(Nov 23 – Dec 20\)/);
  });

  it('downloads a TeacherSync .ics file of the chosen events, and changes nothing saved', async () => {
    const before = JSON.stringify({ ...localStorage });
    click($('[data-act="export"]'));
    click(sheet().querySelector('[data-submit]'));
    expect(names).toEqual(['TeacherSync-2026-11-23-to-2026-11-29.ics']);
    expect(blobs[0].type).toBe('text/calendar;charset=utf-8');
    const text = await blobs[0].text();
    expect(text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(8);
    expect(text).toContain('SUMMARY:Task: Make copies');
    expect(text).toContain('UID:due-');
    expect(text).not.toMatch(/Someday plan|Undated task/);
    expect($('#toast').textContent).toBe('Exported 8 events');
    expect(JSON.stringify({ ...localStorage })).toBe(before);
  });

  it('nothing chosen: says so and downloads nothing', () => {
    click($('[data-act="export"]'));
    for (const box of sheet().querySelectorAll('input[name="kind"]')) box.click();
    click(sheet().querySelector('[data-submit]'));
    expect(sheet().querySelector('.form-error').textContent).toBe('Nothing to export for these choices.');
    expect(names).toEqual([]);
  });
});
