// Tasks and Quick Add through the screens (Tasks, Today, Classes), with the real store and localStorage.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeSystemTheme, resetDom } from './helpers.js';
import { store } from '../src/data/index.js';
import { initTheme } from '../src/lib/theme.js';
import { mountShell } from '../src/shell.js';
import { startRouter, hrefFor } from '../src/router.js';
import { resetTaskFilters } from '../src/views/tasks.js';

// Monday, November 23, 2026.
let stop, bio;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const click = el => { if (!el) throw new Error('nothing to click'); el.click(); };
const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
const sheet = () => $('dialog.form-sheet');
const confirmSheet = () => $('dialog.sheet:not(.form-sheet)');
const choose = label => click([...confirmSheet().querySelectorAll('button')].find(b => b.textContent === label));
const titles = () => $$('.task-item .lesson-open b').map(b => b.textContent);
const row = title => $$('.task-item').find(li => li.querySelector('b').textContent === title);
const view = v => click($(`[data-view="${v}"]`));
const filter = (k, v) => set($(`[data-f="${k}"]`), v);
const idOf = title => store.all('tasks').find(t => t.title === title).id;
const tick = () => new Promise(r => setTimeout(r, 0));
const qa = () => $('[data-qa]');
const qaTitle = () => qa().querySelector('[name="title"]');
function quick(title, opts = {}) {
  const f = qa();
  for (const [k, v] of Object.entries(opts)) set(f.elements[k], v);
  set(f.elements.title, title);
  f.querySelector('[type="submit"]').click();
}
const check = (title, on) => { const box = row(title).querySelector('[data-act="toggle"]'); box.checked = on; box.dispatchEvent(new Event('change', { bubbles: true })); };

function start(route = 'tasks') {
  const shell = mountShell(document.getElementById('app'));
  location.hash = hrefFor(route);
  stop = startRouter((r, opts) => shell.show(r, opts));
}
function seed() {
  bio = store.create('classes', { name: 'Biology 1', color: 's3', meetings: [1, 3, 5].map(d => ({ day: d, start: '10:00', end: '10:50' })) }).record;
  store.create('tasks', { title: 'Old copies', due: '2026-11-20' });
  store.create('tasks', { title: 'Email office', due: '2026-11-23', priority: 'high' });
  store.create('tasks', { title: 'Book lab', due: '2026-11-25', classId: bio.id });
  store.create('tasks', { title: 'Someday reading', priority: 'low', description: 'Look at the résumé article' });
  const d = store.create('tasks', { title: 'Done thing', due: '2026-11-19' }).record;
  store.update('tasks', d.id, { done: true });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 23, 9, 0));
  resetDom();
  resetTaskFilters();
  fakeSystemTheme(false);
  initTheme();
});
afterEach(() => { stop && stop(); stop = null; vi.useRealTimers(); });

describe('Quick Add on Tasks', () => {
  beforeEach(() => start());

  it('first visit: Quick Add and a short explanation; no class needed', () => {
    expect($('h1').textContent).toBe('Tasks');
    expect($('#view').textContent).toContain('No tasks yet');
    expect(qa().querySelector('label[for]').textContent).toBe('New task');
    expect(qa().querySelector('summary').textContent).toBe('No due date · Normal priority · No class');
  });

  it('an empty title is refused, next to the box', () => {
    quick('   ');
    const err = qa().querySelector('[data-err="title"]');
    expect([err.hidden, err.textContent]).toEqual([false, 'Type the task first.']);
    expect(qaTitle().getAttribute('aria-invalid')).toBe('true');
    expect(store.all('tasks')).toEqual([]);
  });

  it('a title and Enter saves it; the box clears and keeps focus; the list shows it; Undo removes it', () => {
    qaTitle().focus();
    quick('Make copies');
    expect(store.all('tasks')).toHaveLength(1);
    expect(store.all('tasks')[0]).toMatchObject({ title: 'Make copies', due: null, priority: 'normal', classId: null, done: false });
    expect(qaTitle().value).toBe('');
    expect(document.activeElement).toBe(qaTitle());
    expect(titles()).toEqual(['Make copies']);
    expect($('#toast').textContent).toContain('Added Make copies');
    click($('#toast .toast-act'));
    expect(store.all('tasks')).toEqual([]);
  });

  it('due date, priority and class are optional, shown in the summary, and kept for the next task', () => {
    store.create('classes', { name: 'Chemistry' });
    const chem = store.all('classes')[0];
    click(qa().querySelector('summary'));
    quick('Grade labs', { due: '2026-11-24', priority: 'high', classId: chem.id });
    expect(store.all('tasks')[0]).toMatchObject({ title: 'Grade labs', due: '2026-11-24', priority: 'high', classId: chem.id });
    expect(qa().querySelector('summary').textContent).toBe('Due tomorrow · High priority · Chemistry');
    quick('Order supplies');
    expect(store.all('tasks')[1]).toMatchObject({ due: '2026-11-24', priority: 'high', classId: chem.id });
  });

  it('is saved for good', () => {
    quick('Survives a reload');
    stop(); store.load(); document.body.innerHTML = '<div id="app"></div>'; start();
    expect(titles()).toEqual(['Survives a reload']);
    expect(JSON.parse(localStorage.getItem('tsync-tasks'))[0].title).toBe('Survives a reload');
  });
});

describe('the task list', () => {
  beforeEach(() => { seed(); start(); });

  it('To do: overdue first, then today, then upcoming, then no date; words for each state', () => {
    expect(titles()).toEqual(['Old copies', 'Email office', 'Book lab', 'Someday reading']);
    expect(row('Old copies').textContent).toMatch(/Overdue.*Was due Fri, Nov 20 \(3 days ago\)/s);
    expect(row('Email office').textContent).toMatch(/Due today\s*High priority.*Due today/s);
    expect(row('Book lab').textContent).toMatch(/Biology 1 · Due Wed, Nov 25 \(in 2 days\)/);
    expect(row('Someday reading').textContent).toMatch(/Low priority.*No due date · Look at the résumé article/s);
    expect($$('.view-btn').map(b => b.textContent.replace(/\s+/g, ' ').trim())).toEqual(['To do 4', 'Needs attention 2', 'Upcoming 1', 'Done 1', 'All 5']);
  });

  it('views', () => {
    view('attention'); expect(titles()).toEqual(['Old copies', 'Email office']);
    view('upcoming'); expect(titles()).toEqual(['Book lab']);
    view('done'); expect(titles()).toEqual(['Done thing']);
    expect(row('Done thing').classList.contains('is-done')).toBe(true);
    expect(row('Done thing').textContent).not.toContain('Overdue');
  });

  it('completing with the checkbox (focus stays); reopening recalculates overdue; Undo', () => {
    const box = row('Old copies').querySelector('[data-act="toggle"]');
    box.focus();
    check('Old copies', true);
    expect(store.get('tasks', idOf('Old copies'))).toMatchObject({ done: true });
    expect(titles()).not.toContain('Old copies');
    expect($('#toast').textContent).toContain('Done: Old copies');
    click($('#toast .toast-act'));
    expect(store.get('tasks', idOf('Old copies')).done).toBe(false);
    view('done');
    check('Done thing', false);
    view('open');
    expect(row('Done thing').textContent).toContain('Overdue');
    expect(store.get('tasks', idOf('Done thing')).doneAt).toBeNull();
  });

  it('completing from the keyboard moves focus to the next task, not the top of the page', () => {
    row('Old copies').querySelector('[data-act="toggle"]').focus();
    check('Old copies', true);
    expect(document.activeElement).toBe(row('Email office').querySelector('[data-act="toggle"]'));
    check('Email office', true); check('Book lab', true);
    row('Someday reading').querySelector('[data-act="toggle"]').focus();
    check('Someday reading', true);                                   // the last one: focus goes to the count
    expect(document.activeElement).toBe($('.results-head .note'));
  });

  it('the view sheet: Mark done and Reopen', async () => {
    click(row('Email office').querySelector('[data-act="open"]'));
    expect(confirmSheet().textContent).toMatch(/Due today\s*High priority\s*No class.*Due today/s);
    choose('Mark done');
    await vi.waitFor(() => expect(store.get('tasks', idOf('Email office')).done).toBe(true));
    view('done');
    click(row('Email office').querySelector('[data-act="open"]'));
    expect(confirmSheet().textContent).toMatch(/Done Mon, Nov 23/);
    choose('Reopen');
    await vi.waitFor(() => expect(store.get('tasks', idOf('Email office')).done).toBe(false));
  });

  it('the full form edits every field; a title is required', () => {
    click(row('Someday reading').querySelector('[data-act="edit"]'));
    const f = sheet().querySelector('form');
    set(f.elements.title, '');
    click(f.querySelector('[data-submit]'));
    expect(sheet().querySelector('[data-err="title"]').textContent).toBe('Give the task a title');
    set(f.elements.title, 'Read the article');
    set(f.elements.due, '2026-11-26');
    set(f.elements.classId, bio.id);
    f.querySelector('input[name="priority"][value="high"]').checked = true;
    set(f.elements.description, 'Then share it');
    click(f.querySelector('[data-submit]'));
    expect(store.get('tasks', idOf('Read the article'))).toMatchObject({ due: '2026-11-26', classId: bio.id, priority: 'high', description: 'Then share it' });
    click(row('Read the article').querySelector('[data-act="edit"]'));
    sheet().querySelector('[name="done"]').checked = true;
    click(sheet().querySelector('[data-submit]'));
    expect(store.get('tasks', idOf('Read the article')).done).toBe(true);
  });

  it('search, filters, Clear, and the phone Filters count', () => {
    filter('query', 'resume');
    expect(titles()).toEqual(['Someday reading']);
    click($('[data-act="clear"]'));
    filter('classId', bio.id);
    expect(titles()).toEqual(['Book lab']);
    filter('classId', 'none');
    expect(titles()).toEqual(['Old copies', 'Email office', 'Someday reading']);
    filter('priority', 'high');
    expect(titles()).toEqual(['Email office']);
    expect($('[data-act="toggle-filters"]').textContent).toBe('Filters (2)');
    click($('[data-act="clear"]'));
    filter('due', 'overdue');
    expect(titles()).toEqual(['Old copies']);
    filter('due', 'none');
    expect(titles()).toEqual(['Someday reading']);
    filter('query', 'zebra');
    expect($('#view').textContent).toContain('No tasks match “zebra”');
  });

  it('delete asks first; Cancel keeps it; Undo brings it back', async () => {
    const id = idOf('Book lab');
    click(row('Book lab').querySelector('[data-act="delete"]'));
    choose('Cancel');
    await tick();
    expect(store.get('tasks', id)).toBeTruthy();
    click(row('Book lab').querySelector('[data-act="delete"]'));
    choose('Delete task');
    await vi.waitFor(() => expect(store.get('tasks', id)).toBeNull());
    expect(store.all('classes')).toHaveLength(1);
    click($('#toast .toast-act'));
    expect(store.get('tasks', id)).toMatchObject({ classId: bio.id });
  });
});

describe('Today', () => {
  beforeEach(() => { seed(); start('today'); });

  it('overdue and due today, separately counted, clickable, with a link to Tasks', async () => {
    const groups = $$('.att-group').map(g => g.querySelector('h3').textContent.replace(/\s+/g, ' ').trim());
    expect(groups).toEqual(['Overdue tasks 1', 'Tasks due today 1']);
    expect($('.lede').textContent).toMatch(/1 overdue task, 1 task due\./);
    click($('.attention [data-task]'));
    expect(confirmSheet().querySelector('h2').textContent).toBe('Old copies');
    choose('Mark done');
    await vi.waitFor(() => expect($('.attention').textContent).not.toContain('Overdue tasks'));
    click($('[data-act="see-tasks"]'));
    await vi.waitFor(() => expect($('h1').textContent).toBe('Tasks'));
    expect($('[data-view="attention"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('another day: tasks due then; overdue stays with the real today; upcoming tasks open', () => {
    click($('[data-day="next"]')); click($('[data-day="next"]'));    // Wed, Nov 25
    const att = $('.attention').textContent.replace(/\s+/g, ' ');
    expect(att).toMatch(/Tasks due this day 1\s*Book lab/);
    expect(att).not.toContain('Overdue');
    click($('[data-day="today"]'));
    click($('.up-list [data-task]'));
    expect(confirmSheet().querySelector('h2').textContent).toBe('Book lab');
  });

  it('Quick Add starts on the day shown, follows the day, and the task appears at once (focus kept)', () => {
    expect(qa().querySelector('summary').textContent).toBe('Due today · Normal priority · No class');
    qaTitle().focus();
    quick('Call parent back');
    expect(store.all('tasks').find(t => t.title === 'Call parent back').due).toBe('2026-11-23');
    expect($('.attention').textContent).toMatch(/Tasks due today 2/);
    expect(document.activeElement).toBe(qaTitle());
    expect(qaTitle().value).toBe('');
    click($('[data-day="next"]'));
    expect(qa().querySelector('summary').textContent).toBe('Due tomorrow · Normal priority · No class');
    quick('Prep tomorrow');
    expect(store.all('tasks').find(t => t.title === 'Prep tomorrow').due).toBe('2026-11-24');
  });

  it('what’s typed in Quick Add survives a redraw from elsewhere', () => {
    set(qaTitle(), 'Half typed');
    store.create('tasks', { title: 'Saved in another tab' });
    expect(qaTitle().value).toBe('Half typed');
  });
});

describe('Classes', () => {
  beforeEach(() => { seed(); start('classes'); });

  it('shows the class’s open tasks and opens them in Tasks', async () => {
    const chip = $(`[data-act="class-tasks"][data-id="${bio.id}"]`);
    expect(chip.textContent).toBe('1 open task');
    click(chip);
    await vi.waitFor(() => expect($('h1').textContent).toBe('Tasks'));
    expect(titles()).toEqual(['Book lab']);
  });

  it('deleting a class keeps its tasks without a class, says so, and Undo links them again', async () => {
    click($(`[data-act="delete-class"][data-id="${bio.id}"]`));
    expect(confirmSheet().textContent).toMatch(/Its 1 task is kept, without a class\./);
    choose('Delete class');
    await vi.waitFor(() => expect(store.all('classes')).toEqual([]));
    expect(store.all('tasks')).toHaveLength(5);
    expect(store.get('tasks', idOf('Book lab')).classId).toBeNull();
    click($('#toast .toast-act'));
    expect(store.get('tasks', idOf('Book lab')).classId).toBe(bio.id);
  });
});
