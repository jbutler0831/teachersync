// Lesson plans through the screens (Lesson plans, Today, Classes), with the real store and localStorage.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeSystemTheme, resetDom } from './helpers.js';
import { store } from '../src/data/index.js';
import { initTheme } from '../src/lib/theme.js';
import { mountShell } from '../src/shell.js';
import { startRouter, hrefFor } from '../src/router.js';
import { resetLessonFilters } from '../src/views/lessons.js';

// Monday, November 23, 2026.
let stop;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const click = el => { if (!el) throw new Error('nothing to click'); el.click(); };
const go = id => { location.hash = hrefFor(id); window.dispatchEvent(new HashChangeEvent('hashchange')); };
const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
const sheet = () => $('dialog.form-sheet');
const err = k => sheet().querySelector(`[data-err="${k}"]`).textContent;
const submit = () => click(sheet().querySelector('[data-submit]'));
const confirmSheet = () => $('dialog.sheet:not(.form-sheet)');
const choose = label => click([...confirmSheet().querySelectorAll('button')].find(b => b.textContent === label));
const titles = () => $$('.lesson-open b').map(b => b.textContent);
const groups = () => $$('.group-head').map(h => h.textContent);
const filter = (k, v) => set($(`[data-f="${k}"]`), v);
const tick = () => new Promise(r => setTimeout(r, 0));

function start(route = 'lessons') {
  const shell = mountShell(document.getElementById('app'));
  location.hash = hrefFor(route);
  stop = startRouter((r, opts) => shell.show(r, opts));
}
function fillLesson(v) {
  const f = sheet().querySelector('form');
  for (const [k, val] of Object.entries(v)) {
    if (k === 'status') { f.querySelector(`input[name="status"][value="${val}"]`).checked = true; f.querySelector(`input[name="status"][value="${val}"]`).dispatchEvent(new Event('change', { bubbles: true })); }
    else set(f.elements[k], val);
  }
}
let bio, chem;
function seed() {
  bio = store.create('classes', { name: 'Biology 1', room: '204', color: 's3', meetings: [1, 3, 5].map(d => ({ day: d, start: '10:00', end: '10:50' })) }).record;
  chem = store.create('classes', { name: 'Chemistry', color: 's7', meetings: [2, 4].map(d => ({ day: d, start: '09:00', end: '09:50' })) }).record;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 23, 9, 0));
  resetDom();
  resetLessonFilters();
  fakeSystemTheme(false);
  initTheme();
});
afterEach(() => { stop && stop(); stop = null; vi.useRealTimers(); });

describe('empty states', () => {
  it('no classes: explains a class comes first, and offers to add one', () => {
    start();
    expect($('h1').textContent).toBe('Lesson plans');
    expect($('#view').textContent).toContain('Add a class first');
    expect($('[data-f]')).toBeNull();
    click($('[data-act="add-class"]'));
    expect(sheet().querySelector('h2').textContent).toBe('Add a class');
  });

  it('classes but no plans: one clear button', () => {
    seed(); start();
    expect($('#view').textContent).toContain('No lesson plans yet');
    click($('[data-act="new"]'));
    expect(sheet().querySelector('h2').textContent).toBe('New lesson plan');
    expect(document.activeElement).toBe(sheet().querySelector('[name="title"]'));
  });
});

describe('creating and editing', () => {
  beforeEach(() => { seed(); start(); });

  it('saves every field, shows it under its date, and keeps it after a reload', () => {
    click($('[data-act="new"]'));
    fillLesson({ title: 'Cell structure', classId: bio.id, date: '2026-11-23', status: 'ready',
      objectives: 'Name 3 organelles', activities: 'Warm-up\nMicroscope lab', materials: 'Microscopes', assessment: 'Exit ticket', notes: 'Room B' });
    submit();
    expect(sheet()).toBeNull();
    const [l] = store.all('lessons');
    expect(l).toMatchObject({ title: 'Cell structure', classId: bio.id, date: '2026-11-23', status: 'ready', objectives: 'Name 3 organelles',
      activities: 'Warm-up\nMicroscope lab', materials: 'Microscopes', assessment: 'Exit ticket', notes: 'Room B' });
    expect(groups()).toEqual(['Today · Mon, Nov 23']);
    expect($('.lesson-item').textContent).toMatch(/Cell structure\s*Planned.*Biology 1 · Name 3 organelles/s);
    stop(); store.load(); document.body.innerHTML = '<div id="app"></div>'; start();
    expect(titles()).toEqual(['Cell structure']);
    expect(JSON.parse(localStorage.getItem('tsync-lessons'))[0].assessment).toBe('Exit ticket');
  });

  it('only a title and a class are needed; errors appear next to the fields', () => {
    click($('[data-act="new"]'));
    submit();
    expect(err('title')).toBe('Give the lesson a title');
    expect(err('classId')).toBe('Choose a class');
    expect(sheet().querySelector('[name="title"]').getAttribute('aria-invalid')).toBe('true');
    expect(store.all('lessons')).toEqual([]);
    fillLesson({ title: 'Someday plan', classId: chem.id });
    submit();
    expect(store.all('lessons')[0]).toMatchObject({ date: null, status: 'draft', objectives: '', activities: '' });
    expect(groups()).toEqual(['No date yet']);
  });

  it('too much text is refused with the limit', () => {
    click($('[data-act="new"]'));
    fillLesson({ title: 'x'.repeat(121), classId: bio.id });
    submit();
    expect(err('title')).toMatch(/120 characters/);
  });

  it('the date helper suggests the class’s next days and warns about days it doesn’t meet', () => {
    store.create('daysOff', { title: 'Thanksgiving break', start: '2026-11-25', end: '2026-11-27' });
    click($('[data-act="new"]'));
    fillLesson({ classId: bio.id });
    const help = () => sheet().querySelector('[data-date-help]').textContent.replace(/\s+/g, ' ').trim();
    expect(help()).toBe('Next Biology 1 classes: Mon, Nov 23 Mon, Nov 30 Wed, Dec 2');
    click(sheet().querySelectorAll('[data-pick-date]')[1]);
    expect(sheet().querySelector('[name="date"]').value).toBe('2026-11-30');
    expect(help()).toMatch(/Biology 1 meets at 10:00 AM that day/);
    fillLesson({ date: '2026-11-24' });
    expect(help()).toMatch(/doesn’t meet on Tuesdays\. You can still save/);
    fillLesson({ date: '2026-11-25' });
    expect(help()).toMatch(/day off \(Thanksgiving break\)/);
  });

  it('status: Draft, Planned and Taught, each explained', () => {
    click($('[data-act="new"]'));
    const hint = () => sheet().querySelector('[data-status-hint]').textContent;
    expect(hint()).toBe('Still being prepared.');
    fillLesson({ status: 'ready' });
    expect(hint()).toBe('Ready to teach on its date.');
    fillLesson({ status: 'taught', title: 'T', classId: bio.id });
    submit();
    expect(store.all('lessons')[0].status).toBe('taught');
  });

  it('editing changes the plan in place; class, date and title move it in the list', async () => {
    const l = store.create('lessons', { classId: bio.id, title: 'Cells', date: '2026-11-23' }).record;
    click($(`[data-act="edit"][data-id="${l.id}"]`));
    expect(sheet().querySelector('h2').textContent).toBe('Edit lesson plan');
    fillLesson({ title: 'Atoms', classId: chem.id, date: '2026-11-24', status: 'ready' });
    submit();
    expect(store.all('lessons')).toHaveLength(1);
    expect(store.get('lessons', l.id)).toMatchObject({ title: 'Atoms', classId: chem.id, date: '2026-11-24', status: 'ready', createdAt: l.createdAt });
    expect(groups()).toEqual(['Tomorrow · Tue, Nov 24']);
    expect($('.lesson-item').textContent).toContain('Chemistry');
  });

  it('view shows the plan; Mark taught updates it', async () => {
    const l = store.create('lessons', { classId: bio.id, title: 'Cells', date: '2026-11-23', objectives: 'Organelles', assessment: 'Exit ticket' }).record;
    click($(`[data-act="open"][data-id="${l.id}"]`));
    const view = confirmSheet();
    expect(view.querySelector('h2').textContent).toBe('Cells');
    expect(view.textContent).toMatch(/Draft\s*Biology 1 · Monday, November 23/);
    expect(view.textContent).toMatch(/Objectives\s*Organelles\s*Closing & assessment\s*Exit ticket/);
    expect(view.textContent).not.toContain('Materials');
    choose('Mark taught');
    await vi.waitFor(() => expect(store.get('lessons', l.id).status).toBe('taught'));
    expect($('.lesson-item').textContent).toContain('Taught');
  });
});

describe('finding plans', () => {
  beforeEach(() => {
    seed();
    store.create('lessons', { classId: bio.id, title: 'Cell structure', date: '2026-11-23', objectives: 'Organelles', status: 'ready' });
    store.create('lessons', { classId: chem.id, title: 'Résumé of the mole', date: '2026-11-24', materials: 'Periodic tables' });
    store.create('lessons', { classId: bio.id, title: 'Old microscope lab', date: '2026-11-02', status: 'taught' });
    store.create('lessons', { classId: chem.id, title: 'Someday', notes: 'Ideas' });
    start();
  });

  it('shows upcoming and unscheduled plans by default, soonest first', () => {
    expect(groups()).toEqual(['Today · Mon, Nov 23', 'Tomorrow · Tue, Nov 24', 'No date yet']);
    expect(titles()).toEqual(['Cell structure', 'Résumé of the mole', 'Someday']);
    expect($('.results-head').textContent).toMatch(/3 lesson plans coming up or not yet scheduled/);
  });

  it('searches titles and content, ignoring accents; keeps focus while typing', () => {
    const box = $('[data-f="query"]');
    box.focus();
    filter('query', 'resume periodic');
    expect(titles()).toEqual(['Résumé of the mole']);
    expect(document.activeElement).toBe(box);
    filter('query', 'organelles');
    expect(titles()).toEqual(['Cell structure']);
    filter('query', 'zebra');
    expect($('#view').textContent).toContain('No lesson plans match “zebra”');
    click($('[data-act="clear"]'));
    expect(titles()).toHaveLength(3);
    expect($('[data-f="query"]').value).toBe('');
  });

  it('filters by class, status, past, no date, and a date', () => {
    filter('classId', chem.id);
    expect(titles()).toEqual(['Résumé of the mole', 'Someday']);
    filter('status', 'draft');
    expect(titles()).toEqual(['Résumé of the mole', 'Someday']);
    click($('[data-act="clear"]'));
    filter('when', 'past');
    expect(titles()).toEqual(['Old microscope lab']);
    filter('when', 'undated');
    expect(titles()).toEqual(['Someday']);
    expect($('[data-day-field]').hidden).toBe(true);
    filter('when', 'day');
    expect($('[data-day-field]').hidden).toBe(false);
    filter('day', '2026-11-24');
    expect(titles()).toEqual(['Résumé of the mole']);
  });

  it('the Filters button (phones) opens the filters and counts the ones set', () => {
    const b = $('[data-act="toggle-filters"]');
    expect([b.textContent, b.getAttribute('aria-expanded')]).toEqual(['Filters', 'false']);
    click(b);
    expect(b.getAttribute('aria-expanded')).toBe('true');
    expect($('.filters').classList.contains('open')).toBe(true);
    filter('classId', bio.id);
    filter('when', 'past');
    expect(b.textContent).toBe('Filters (2)');
    click($('[data-act="clear"]'));
    expect($('[data-act="toggle-filters"]').textContent).toBe('Filters');
  });

  it('when nothing upcoming matches, offers the past plans', () => {
    filter('query', 'microscope');
    click($('[data-act="show-past"]'));
    expect(titles()).toEqual(['Old microscope lab']);
    expect($('[data-f="when"]').value).toBe('past');
  });
});

describe('duplicating and deleting', () => {
  let orig;
  beforeEach(() => {
    seed();
    orig = store.create('lessons', { classId: bio.id, title: 'Cells', date: '2026-11-02', objectives: 'Organelles', status: 'taught' }).record;
    start();
    filter('when', 'all');
  });

  it('a copy is a new Draft with no date; the original is untouched', () => {
    click($(`[data-act="copy"][data-id="${orig.id}"]`));
    expect(sheet().querySelector('h2').textContent).toBe('Duplicate lesson plan');
    const f = sheet().querySelector('form');
    expect([f.elements.title.value, f.elements.objectives.value, f.elements.date.value]).toEqual(['Cells', 'Organelles', '']);
    expect(f.querySelector('input[name="status"]:checked').value).toBe('draft');
    fillLesson({ classId: chem.id, date: '2026-11-24' });
    submit();
    const all = store.all('lessons');
    expect(all).toHaveLength(2);
    expect(new Set(all.map(l => l.id)).size).toBe(2);
    expect(store.get('lessons', orig.id)).toEqual(orig);
    expect(all.find(l => l.id !== orig.id)).toMatchObject({ title: 'Cells', classId: chem.id, date: '2026-11-24', status: 'draft', objectives: 'Organelles' });
  });

  it('cancelling a copy saves nothing', () => {
    click($(`[data-act="copy"][data-id="${orig.id}"]`));
    click(sheet().querySelector('[data-cancel]'));
    expect(store.all('lessons')).toHaveLength(1);
  });

  it('delete asks first; Cancel keeps it', async () => {
    click($(`[data-act="delete"][data-id="${orig.id}"]`));
    expect(confirmSheet().textContent).toMatch(/Delete “Cells”\?.*Only this lesson plan is removed/s);
    choose('Cancel');
    await tick();
    expect(store.all('lessons')).toHaveLength(1);
  });

  it('deleting removes only the plan (never its class), and Undo brings it back', async () => {
    click($(`[data-act="delete"][data-id="${orig.id}"]`));
    choose('Delete lesson plan');
    await vi.waitFor(() => expect(store.all('lessons')).toEqual([]));
    expect(store.all('classes')).toHaveLength(2);
    expect(JSON.parse(localStorage.getItem('tsync-lessons'))).toEqual([]);
    click($('#toast .toast-act'));
    expect(store.get('lessons', orig.id)).toEqual(orig);
    expect(titles()).toEqual(['Cells']);
  });

  it('deleting a class still removes its plans, after asking (as before)', async () => {
    go('classes');
    click($(`[data-act="delete-class"][data-id="${bio.id}"]`));
    expect(confirmSheet().textContent).toMatch(/1 lesson plan will be deleted too/);
    choose('Delete class');
    await vi.waitFor(() => expect(store.all('lessons')).toEqual([]));
    expect(store.all('classes').map(c => c.name)).toEqual(['Chemistry']);
  });
});

describe('a plan whose class is missing', () => {
  it('is listed as Missing class, can be filtered, and asks for a class when edited', () => {
    localStorage.setItem('tsync-meta', JSON.stringify({ app: 'TeacherSync', schema: 1 }));
    localStorage.setItem('tsync-classes', JSON.stringify([{ id: 'c1', name: 'Bio', meetings: [], createdAt: 1, updatedAt: 1 }]));
    localStorage.setItem('tsync-lessons', JSON.stringify([{ id: 'L1', classId: 'gone', date: '2026-12-01', title: 'Orphan', status: 'draft', createdAt: 1, updatedAt: 1 }]));
    store.load();
    start();
    expect($('.lesson-item').textContent).toContain('Missing class');
    filter('classId', 'missing');
    expect(titles()).toEqual(['Orphan']);
    click($('[data-act="edit"][data-id="L1"]'));
    expect(sheet().querySelector('[name="classId"]').selectedOptions[0].textContent).toBe('Missing class: choose one');
    submit();
    expect(err('classId')).toBe('Choose a class');
    fillLesson({ classId: 'c1' });
    submit();
    expect(store.get('lessons', 'L1').classId).toBe('c1');
  });
});

describe('Today', () => {
  beforeEach(() => { seed(); });

  it('shows the plan with its class and status, opens it, and updates at once when it changes', async () => {
    const l = store.create('lessons', { classId: bio.id, title: 'Cells', date: '2026-11-23' }).record;
    start('today');
    const chip = $('.slot .lesson-chip');
    expect(chip.textContent).toMatch(/Cells\s*Draft/);
    expect(chip.getAttribute('aria-label')).toBe('Lesson plan: Cells, Draft. Open');
    click(chip);
    expect(confirmSheet().querySelector('h2').textContent).toBe('Cells');
    choose('Edit');
    await vi.waitFor(() => expect(sheet()).toBeTruthy());
    fillLesson({ status: 'ready', title: 'Cell structure' });
    submit();
    expect($('.slot .lesson-chip').textContent).toMatch(/Cell structure\s*Planned/);
    store.update('lessons', l.id, { date: '2026-11-25' });
    expect($('.slot .lesson-chip')).toBeNull();
    expect($('.slot').textContent).toMatch(/No lesson plan\s*Plan a lesson/);
  });

  it('“Plan a lesson” starts a plan for that class and day', () => {
    start('today');
    click($('[data-act="plan"]'));
    const f = sheet().querySelector('form');
    expect([f.elements.classId.value, f.elements.date.value]).toEqual([bio.id, '2026-11-23']);
    fillLesson({ title: 'Quick plan' });
    submit();
    expect($('.slot .lesson-chip').textContent).toContain('Quick plan');
  });

  it('a draft for today is counted; the quick action starts a plan on the shown day', () => {
    store.create('lessons', { classId: bio.id, title: 'Cells', date: '2026-11-23' });
    start('today');
    expect($('.attention').textContent).toMatch(/1 lesson plan for today is still a draft/);
    click($('[data-day="next"]'));
    click($('[data-act="new-lesson"]'));
    expect(sheet().querySelector('[name="date"]').value).toBe('2026-11-24');
  });

  it('a plan on a day its class doesn’t meet is still shown and can be opened', () => {
    store.create('lessons', { classId: bio.id, title: 'Tuesday plan', date: '2026-11-24' });
    start('today');
    click($('[data-day="next"]'));
    click($('.other-lessons .lesson-chip'));
    expect(confirmSheet().querySelector('h2').textContent).toBe('Tuesday plan');
  });
});

describe('Classes', () => {
  beforeEach(() => {
    seed();
    store.create('lessons', { classId: bio.id, title: 'Old', date: '2026-11-02' });
    store.create('lessons', { classId: bio.id, title: 'Next one', date: '2026-11-25' });
    store.create('lessons', { classId: chem.id, title: 'Chem plan', date: '2026-11-24' });
    start('classes');
  });

  it('each class shows its plan count and next plan', () => {
    const bioItem = $$('.class-item').find(li => li.textContent.includes('Biology 1'));
    expect(bioItem.querySelector('.class-lessons').textContent.replace(/\s+/g, ' ')).toMatch(/2 lesson plans Next: Next one Wed, Nov 25 Plan a lesson/);
  });

  it('the count opens Lesson plans for that class, all dates', async () => {
    click($(`[data-act="class-lessons"][data-id="${bio.id}"]`));
    await vi.waitFor(() => expect($('h1').textContent).toBe('Lesson plans'));
    expect($('[data-f="classId"]').value).toBe(bio.id);
    expect(titles()).toEqual(['Next one', 'Old']);
  });

  it('“Plan a lesson” starts a plan for that class; it shows up on the class at once', () => {
    click($(`[data-act="plan-for"][data-id="${chem.id}"]`));
    expect(sheet().querySelector('[name="classId"]').value).toBe(chem.id);
    fillLesson({ title: 'New chem', date: '2026-11-24' });
    submit();
    const chemItem = $$('.class-item').find(li => li.textContent.includes('Chemistry'));
    expect(chemItem.textContent).toContain('2 lesson plans');
  });
});
