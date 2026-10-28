// Assignments through the screens (Assignments, Today, Classes), with the real store and localStorage.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeSystemTheme, resetDom } from './helpers.js';
import { store } from '../src/data/index.js';
import { initTheme } from '../src/lib/theme.js';
import { mountShell } from '../src/shell.js';
import { startRouter, hrefFor } from '../src/router.js';
import { resetAssignmentFilters } from '../src/views/assignments.js';

// Monday, November 23, 2026.
let stop, bio, chem;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const click = el => { if (!el) throw new Error('nothing to click'); el.click(); };
const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
const sheet = () => $('dialog.form-sheet');
const err = k => sheet().querySelector(`[data-err="${k}"]`).textContent;
const submit = () => click(sheet().querySelector('[data-submit]'));
const confirmSheet = () => $('dialog.sheet:not(.form-sheet)');
const choose = label => click([...confirmSheet().querySelectorAll('button')].find(b => b.textContent === label));
const titles = () => $$('.lesson-open b').map(b => b.textContent);
const filter = (k, v) => set($(`[data-f="${k}"]`), v);
const view = v => click($(`[data-view="${v}"]`));
const tick = () => new Promise(r => setTimeout(r, 0));
const row = title => $$('.asg-item').find(li => li.querySelector('b').textContent === title);
const idOf = title => store.all('assignments').find(a => a.title === title).id;

function start(route = 'assignments') {
  const shell = mountShell(document.getElementById('app'));
  location.hash = hrefFor(route);
  stop = startRouter((r, opts) => shell.show(r, opts));
}
function fill(v) {
  const f = sheet().querySelector('form');
  for (const [k, val] of Object.entries(v)) {
    if (k === 'status') { const r = f.querySelector(`input[name="status"][value="${val}"]`); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
    else set(f.elements[k], val);
  }
}
function seed() {
  bio = store.create('classes', { name: 'Biology 1', color: 's3', meetings: [1, 3, 5].map(d => ({ day: d, start: '10:00', end: '10:50' })) }).record;
  chem = store.create('classes', { name: 'Chemistry', color: 's7', meetings: [] }).record;
}
function seedAssignments() {
  store.create('assignments', { classId: bio.id, title: 'Lab report', due: '2026-11-18', gradeBy: '2026-11-21', status: 'to-grade' });   // late
  store.create('assignments', { classId: bio.id, title: 'Worksheet', due: '2026-11-20' });                                              // past due
  store.create('assignments', { classId: chem.id, title: 'Mole quiz', due: '2026-11-19', gradeBy: '2026-11-25', status: 'to-grade' });  // to grade
  store.create('assignments', { classId: chem.id, title: 'Density essay', due: '2026-11-26', description: 'Two pages about résumés' });  // upcoming
  store.create('assignments', { classId: bio.id, title: 'Cell test', due: '2026-11-09', status: 'graded' });
  store.create('assignments', { classId: bio.id, title: 'Map', due: '2026-11-02', status: 'returned', notes: 'Rubric in drawer' });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 23, 9, 0));
  resetDom();
  resetAssignmentFilters();
  fakeSystemTheme(false);
  initTheme();
});
afterEach(() => { stop && stop(); stop = null; vi.useRealTimers(); });

describe('empty states', () => {
  it('no classes: add a class first', () => {
    start();
    expect($('h1').textContent).toBe('Assignments');
    expect($('#view').textContent).toContain('Add a class first');
  });
  it('classes but no assignments: one clear button, and no student data is promised', () => {
    seed(); start();
    expect($('#view').textContent).toMatch(/No assignments yet.*No student names or scores are stored/s);
    click($('[data-act="new"]'));
    expect(sheet().querySelector('h2').textContent).toBe('New assignment');
    expect(document.activeElement).toBe(sheet().querySelector('[name="title"]'));
  });
});

describe('creating and editing', () => {
  beforeEach(() => { seed(); start(); });

  it('saves every field; the grading deadline follows the due date (+3 days from Settings); kept after a reload', () => {
    click($('[data-act="new"]'));
    const f = sheet().querySelector('form');
    expect(f.elements.assigned.value).toBe('2026-11-23');          // assigned defaults to today
    fill({ title: 'Lab report', classId: bio.id, due: '2026-11-27' });
    expect(f.elements.gradeBy.value).toBe('2026-11-30');
    expect(sheet().querySelector('[data-grade-hint]').textContent).toMatch(/3 days after the due date/);
    fill({ due: '2026-11-30' });
    expect(f.elements.gradeBy.value).toBe('2026-12-03');
    fill({ description: 'Hypothesis\nMethod', notes: 'Rubric B' });
    submit();
    expect(sheet()).toBeNull();
    expect(store.all('assignments')[0]).toMatchObject({ title: 'Lab report', classId: bio.id, assigned: '2026-11-23', due: '2026-11-30',
      gradeBy: '2026-12-03', status: 'assigned', description: 'Hypothesis\nMethod', notes: 'Rubric B' });
    view('upcoming');
    expect(row('Lab report').textContent).toMatch(/Assigned.*Biology 1 · Due Mon, Nov 30 \(in 7 days\) · Grade by Thu, Dec 3 \(in 10 days\)/s);
    stop(); store.load(); document.body.innerHTML = '<div id="app"></div>'; start();
    view('upcoming');
    expect(titles()).toEqual(['Lab report']);
  });

  it('a grading deadline the teacher sets stops following the due date', () => {
    click($('[data-act="new"]'));
    fill({ title: 'Essay', classId: bio.id, due: '2026-11-27', gradeBy: '2026-12-10' });
    fill({ due: '2026-11-28' });
    expect(sheet().querySelector('[name="gradeBy"]').value).toBe('2026-12-10');
  });

  it('only a title and a class are needed; dates are optional', () => {
    click($('[data-act="new"]'));
    fill({ assigned: '' });
    submit();
    expect(err('title')).toBe('Give the assignment a title');
    expect(err('classId')).toBe('Choose a class');
    fill({ title: 'Reading', classId: chem.id });
    submit();
    expect(store.all('assignments')[0]).toMatchObject({ assigned: null, due: null, gradeBy: null, description: '', notes: '' });
  });

  it('date order and length errors appear by the fields, and nothing is saved', () => {
    click($('[data-act="new"]'));
    fill({ title: 'x'.repeat(121), classId: bio.id, assigned: '2026-11-23', due: '2026-11-20' });
    fill({ gradeBy: '2026-11-19' });
    submit();
    expect(err('title')).toMatch(/120 characters/);
    expect(err('due')).toBe('The due date is before the assigned date');
    expect(err('gradeBy')).toBe('The grading deadline is before the due date');
    expect(sheet().querySelector('[name="due"]').getAttribute('aria-invalid')).toBe('true');
    expect(store.all('assignments')).toEqual([]);
  });

  it('each status can be chosen and is explained', () => {
    click($('[data-act="new"]'));
    const hint = () => sheet().querySelector('[data-status-hint]').textContent;
    const seen = [];
    for (const s of ['assigned', 'to-grade', 'graded', 'returned']) { fill({ status: s }); seen.push(hint()); }
    expect(seen).toEqual(['Given out, not collected yet.', 'Collected and waiting to be graded.', 'Graded, not handed back yet.', 'Graded and handed back.']);
    fill({ title: 'T', classId: bio.id });
    submit();
    expect(store.all('assignments')[0].status).toBe('returned');
  });

  it('editing changes it in place, keeping its id and creation time', () => {
    const a = store.create('assignments', { classId: bio.id, title: 'Quiz', due: '2026-11-25' }).record;
    view('all');
    click($(`[data-act="edit"][data-id="${a.id}"]`));
    expect(sheet().querySelector('h2').textContent).toBe('Edit assignment');
    expect(sheet().querySelector('[name="gradeBy"]').value).toBe('2026-11-28');
    fill({ title: 'Quiz 2', classId: chem.id, due: '2026-11-26' });
    expect(sheet().querySelector('[name="gradeBy"]').value).toBe('2026-11-29');   // still the default, so it moves
    submit();
    expect(store.all('assignments')).toHaveLength(1);
    expect(store.get('assignments', a.id)).toMatchObject({ title: 'Quiz 2', classId: chem.id, due: '2026-11-26', gradeBy: '2026-11-29', createdAt: a.createdAt });
    expect(row('Quiz 2').textContent).toContain('Chemistry');
  });
});

describe('the list and grading', () => {
  beforeEach(() => { seed(); seedAssignments(); start(); });

  it('opens on Needs attention: late, then past due, then To grade; each view shows its count', () => {
    expect($('[data-view="attention"]').getAttribute('aria-pressed')).toBe('true');
    expect(titles()).toEqual(['Lab report', 'Worksheet', 'Mole quiz']);
    expect($$('.view-btn').map(b => b.textContent.replace(/\s+/g, ' ').trim())).toEqual(['Needs attention 3', 'Upcoming 1', 'Graded 2', 'All 6']);
    expect(row('Lab report').textContent).toMatch(/To grade\s*Late/);
    expect(row('Worksheet').textContent).toMatch(/Assigned\s*Past due.*Due Fri, Nov 20 \(3 days ago\)/s);
    expect(row('Mole quiz').querySelector('.status.s-late')).toBeNull();
    view('upcoming'); expect(titles()).toEqual(['Density essay']);
    view('done'); expect(titles()).toEqual(['Cell test', 'Map']);
    expect(row('Map').textContent).not.toContain('Grade by');
    view('all'); expect(titles()).toHaveLength(6);
  });

  it('marking graded takes it off Needs attention and clears Late; Undo puts it back', () => {
    const b = row('Lab report').querySelector('[data-act="step"]');
    expect(b.textContent).toBe('Mark graded');
    click(b);
    expect(store.get('assignments', idOf('Lab report')).status).toBe('graded');
    expect(titles()).toEqual(['Worksheet', 'Mole quiz']);
    expect($('#toast').textContent).toMatch(/Lab report: Graded/);
    click($('#toast .toast-act'));
    expect(store.get('assignments', idOf('Lab report')).status).toBe('to-grade');
    expect(titles()[0]).toBe('Lab report');
  });

  it('collecting a past-due assignment: Mark To grade', () => {
    click(row('Worksheet').querySelector('[data-act="step"]'));
    expect(store.get('assignments', idOf('Worksheet')).status).toBe('to-grade');
    expect(row('Worksheet').textContent).not.toContain('Past due');
  });

  it('the view sheet moves it on, and back to To grade (late again if its deadline passed)', async () => {
    view('done');
    click(row('Cell test').querySelector('[data-act="open"]'));
    expect(confirmSheet().textContent).toMatch(/Graded\s*Biology 1.*Graded, not handed back yet\..*Due\s*Mon, Nov 9 \(14 days ago\)/s);
    choose('Mark returned');
    await vi.waitFor(() => expect(store.get('assignments', idOf('Cell test')).status).toBe('returned'));
    store.update('assignments', idOf('Map'), { gradeBy: '2026-11-05' });
    click(row('Map').querySelector('[data-act="open"]'));
    choose('Back to To grade');
    await vi.waitFor(() => expect(store.get('assignments', idOf('Map')).status).toBe('to-grade'));
    view('attention');
    expect(row('Map').textContent).toMatch(/To grade\s*Late/);
  });

  it('search and filters, with Clear and the phone Filters count', () => {
    view('all');
    const box = $('[data-f="query"]');
    box.focus();
    filter('query', 'resume');
    expect(titles()).toEqual(['Density essay']);
    expect(document.activeElement).toBe(box);
    filter('query', 'rubric');
    expect(titles()).toEqual(['Map']);
    click($('[data-act="clear"]'));
    expect($('[data-f="query"]').value).toBe('');
    expect($('[data-view="all"]').getAttribute('aria-pressed')).toBe('true'); // Clear keeps the view
    filter('classId', chem.id);
    expect(titles()).toEqual(['Density essay', 'Mole quiz']);
    filter('status', 'to-grade');
    expect(titles()).toEqual(['Mole quiz']);
    expect($('[data-act="toggle-filters"]').textContent).toBe('Filters (2)');
    click($('[data-act="clear"]'));
    filter('due', 'week');
    expect(titles()).toEqual(['Density essay']);
    filter('due', 'past');
    expect(titles()).toHaveLength(5);
    filter('query', 'zebra');
    expect($('#view').textContent).toContain('No assignments match “zebra”');
  });

  it('delete asks first; Cancel keeps it; deleting removes only it, and Undo restores it', async () => {
    const id = idOf('Worksheet');
    click(row('Worksheet').querySelector('[data-act="delete"]'));
    expect(confirmSheet().textContent).toMatch(/Delete “Worksheet”\?.*Only this assignment is removed/s);
    choose('Cancel');
    await tick();
    expect(store.get('assignments', id)).toBeTruthy();
    click(row('Worksheet').querySelector('[data-act="delete"]'));
    choose('Delete assignment');
    await vi.waitFor(() => expect(store.get('assignments', id)).toBeNull());
    expect(store.all('classes')).toHaveLength(2);
    expect(store.all('assignments')).toHaveLength(5);
    click($('#toast .toast-act'));
    expect(store.get('assignments', id)).toBeTruthy();
  });
});

describe('Today', () => {
  beforeEach(() => { seed(); });

  it('due today, past due, and the grading pile, each assignment once; items open the assignment', async () => {
    seedAssignments();
    store.create('assignments', { classId: bio.id, title: 'Due today', due: '2026-11-23' });
    store.create('assignments', { classId: bio.id, title: 'Collected early', due: '2026-11-23', status: 'to-grade' });
    start('today');
    const groups = $$('.att-group').map(g => g.querySelector('h3').textContent.replace(/\s+/g, ' ').trim());
    expect(groups).toEqual(['Past due, not collected 1', 'Assignments due today 1', 'To grade 3']);
    const all = $$('.attention [data-assignment]').map(b => b.dataset.assignment);
    expect(new Set(all).size).toBe(all.length);
    expect($('.lede').textContent).toMatch(/1 past due, 1 due, 3 to grade\./);
    click($$('.attention [data-assignment]')[0]);
    expect(confirmSheet().querySelector('h2').textContent).toBe('Worksheet');
    choose('Mark To grade');
    await vi.waitFor(() => expect($('.attention').textContent).not.toContain('Past due, not collected'));
    expect($('.attention').textContent).toMatch(/To grade 4/);
  });

  it('on another day: that day’s due assignments; no past due; the grading pile is labelled as now', () => {
    seedAssignments();
    start('today');
    click($('[data-day="next"]')); click($('[data-day="next"]')); click($('[data-day="next"]')); // Thu, Nov 26
    const att = $('.attention').textContent.replace(/\s+/g, ' ');
    expect(att).toMatch(/Assignments due this day 1 Density essay/);
    expect(att).not.toContain('Past due');
    expect(att).toMatch(/To grade · now, all classes 2/);
  });

  it('the next 7 days include due dates and grading deadlines, and open the assignment', () => {
    seedAssignments();
    start('today');
    const items = $$('.up-list li').map(li => li.textContent.replace(/\s+/g, ' ').trim());
    expect(items).toEqual(['Wed, Nov 25 Grade by Mole quiz · Chemistry', 'Thu, Nov 26 Due Density essay · Chemistry']);
    click($('.up-list [data-assignment]'));
    expect(confirmSheet().querySelector('h2').textContent).toBe('Mole quiz');
  });

  it('“See all in Assignments” opens the Needs attention list', async () => {
    seedAssignments();
    start('today');
    click($('[data-act="see-grading"]'));
    await vi.waitFor(() => expect($('h1').textContent).toBe('Assignments'));
    expect($('[data-view="attention"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('with no assignments: an honest empty note; the quick action starts one on the shown day', () => {
    start('today');
    expect($('.attention').textContent).toMatch(/Add assignments to see what’s due/);
    click($('[data-day="next"]'));
    click($('[data-act="new-assignment"]'));
    expect(sheet().querySelector('[name="assigned"]').value).toBe('2026-11-24');
  });
});

describe('Classes', () => {
  beforeEach(() => { seed(); seedAssignments(); start('classes'); });

  it('each class shows its assignments and how many wait to be graded', () => {
    const item = name => $$('.class-item').find(li => li.textContent.includes(name));
    expect(item('Biology 1').textContent).toContain('4 assignments · 1 to grade');
    expect(item('Chemistry').textContent).toContain('2 assignments · 1 to grade');
  });

  it('the count opens Assignments for that class, all of them', async () => {
    click($(`[data-act="class-assignments"][data-id="${chem.id}"]`));
    await vi.waitFor(() => expect($('h1').textContent).toBe('Assignments'));
    expect($('[data-f="classId"]').value).toBe(chem.id);
    expect(titles()).toEqual(['Density essay', 'Mole quiz']);
  });

  it('“Add assignment” starts one for that class', () => {
    click($(`[data-act="add-assignment"][data-id="${chem.id}"]`));
    expect(sheet().querySelector('[name="classId"]').value).toBe(chem.id);
  });

  it('deleting a class says its assignments go too', async () => {
    click($(`[data-act="delete-class"][data-id="${chem.id}"]`));
    expect(confirmSheet().textContent).toMatch(/2 assignments will be deleted too/);
    choose('Delete class');
    await vi.waitFor(() => expect(store.all('assignments')).toHaveLength(4));
  });
});

describe('an assignment whose class is missing', () => {
  it('is listed as Missing class and asks for a class when edited', () => {
    localStorage.setItem('tsync-meta', JSON.stringify({ app: 'TeacherSync', schema: 1 }));
    localStorage.setItem('tsync-classes', JSON.stringify([{ id: 'c1', name: 'Bio', meetings: [], createdAt: 1, updatedAt: 1 }]));
    localStorage.setItem('tsync-assignments', JSON.stringify([{ id: 'a1', classId: 'gone', title: 'Orphan', status: 'to-grade', createdAt: 1, updatedAt: 1 }]));
    store.load();
    start();
    expect(row('Orphan').textContent).toContain('Missing class');
    filter('classId', 'missing');
    expect(titles()).toEqual(['Orphan']);
    click($('[data-act="edit"][data-id="a1"]'));
    submit();
    expect(err('classId')).toBe('Choose a class');
    fill({ classId: 'c1' });
    submit();
    expect(store.get('assignments', 'a1').classId).toBe('c1');
  });
});
