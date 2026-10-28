import { describe, it, expect, afterEach } from 'vitest';
import { isOverdue, isDueToday, filterTasks, viewCounts } from '../../src/data/tasks.js';
import { dayAgenda } from '../../src/data/agenda.js';
import { cleanRecord, defaultSettings, orphansOf } from '../../src/data/schema.js';
import { readBackup, parseBackup, backupText } from '../../src/data/backup.js';
import { iso } from '../../src/lib/dates.js';
import { testStore, memoryStorage, sampleClass } from './memory.js';

const today = '2026-11-23'; // a Monday
const T = (id, over) => ({ id, title: id, description: '', due: null, priority: 'normal', classId: null, done: false, doneAt: null, createdAt: 1, updatedAt: 1, ...over });
const bio = { id: 'bio', name: 'Biology', color: 's1', meetings: [] };

describe('status rules', () => {
  it('overdue only after the due date, never when done, never without a date', () => {
    expect(isOverdue(T('a', { due: '2026-11-22' }), today)).toBe(true);
    expect(isOverdue(T('a', { due: today }), today)).toBe(false);
    expect(isOverdue(T('a', { due: '2026-11-24' }), today)).toBe(false);
    expect(isOverdue(T('a', { due: '2026-11-01', done: true }), today)).toBe(false);
    expect(isOverdue(T('a', {}), today)).toBe(false);
  });
  it('due today only when not done', () => {
    expect(isDueToday(T('a', { due: today }), today)).toBe(true);
    expect(isDueToday(T('a', { due: today, done: true }), today)).toBe(false);
  });

  it('completing, then reopening, goes back to what the due date says; no date is ever invented', () => {
    const { store } = testStore();
    const late = store.create('tasks', { title: 'Late', due: '2026-10-01' }).record;
    const free = store.create('tasks', { title: 'No date' }).record;
    const done = store.update('tasks', late.id, { done: true }).record;
    expect(done.doneAt).toBeGreaterThan(0);
    expect(isOverdue(done, today)).toBe(false);
    const back = store.update('tasks', late.id, { done: false }).record;
    expect([back.doneAt, back.due, isOverdue(back, today)]).toEqual([null, '2026-10-01', true]);
    expect(store.update('tasks', free.id, { done: true }).record.due).toBeNull();
    expect(store.update('tasks', free.id, { done: false }).record.due).toBeNull();
  });

  describe('time zones', () => {
    const tz = process.env.TZ;
    afterEach(() => { process.env.TZ = tz; });
    it('overdue is decided by the teacher’s own calendar day', () => {
      const t = T('a', { due: '2026-11-23' });
      const moment = new Date(Date.UTC(2026, 10, 24, 6, 30)); // 6:30 UTC on Nov 24
      process.env.TZ = 'America/Chicago';                      // 0:30 on Nov 24: overdue
      expect(isOverdue(t, iso(moment))).toBe(true);
      process.env.TZ = 'Pacific/Honolulu';                     // 20:30 on Nov 23: due today
      expect([isOverdue(t, iso(moment)), isDueToday(t, iso(moment))]).toEqual([false, true]);
    });
  });
});

describe('the list', () => {
  const list = [
    T('No date high', { priority: 'high' }),
    T('Upcoming', { due: '2026-11-25', classId: 'bio' }),
    T('Today low', { due: today, priority: 'low' }),
    T('Today high', { due: today, priority: 'high', description: 'Call about the résumé' }),
    T('Overdue new', { due: '2026-11-20' }),
    T('Overdue old', { due: '2026-11-02', classId: 'gone' }),
    T('Far', { due: '2026-12-20' }),
    T('Done early', { done: true, doneAt: 100, due: '2026-11-01' }),
    T('Done late', { done: true, doneAt: 200 }),
  ];
  const run = f => filterTasks(list, [bio], f, today).map(t => t.title);

  it('To do (default): overdue oldest first, then today (high first), then by date, then no date', () => {
    expect(run({})).toEqual(['Overdue old', 'Overdue new', 'Today high', 'Today low', 'Upcoming', 'Far', 'No date high']);
  });
  it('needs attention, upcoming, done (latest first), all (open first)', () => {
    expect(run({ view: 'attention' })).toEqual(['Overdue old', 'Overdue new', 'Today high', 'Today low']);
    expect(run({ view: 'upcoming' })).toEqual(['Upcoming', 'Far']);
    expect(run({ view: 'done' })).toEqual(['Done late', 'Done early']);
    expect(run({ view: 'all' }).slice(-2)).toEqual(['Done late', 'Done early']);
    expect(viewCounts(list, today)).toEqual({ open: 7, attention: 4, upcoming: 2, done: 2, all: 9 });
  });
  it('filters: class, no class, missing class, priority, due; search with class names and no accents', () => {
    expect(run({ view: 'all', classId: 'bio' })).toEqual(['Upcoming']);
    expect(run({ view: 'all', classId: 'missing' })).toEqual(['Overdue old']);
    expect(run({ classId: 'none' })).toEqual(['Overdue new', 'Today high', 'Today low', 'Far', 'No date high']);
    expect(run({ priority: 'high' })).toEqual(['Today high', 'No date high']);
    expect(run({ due: 'overdue' })).toEqual(['Overdue old', 'Overdue new']);
    expect(run({ due: 'today' })).toEqual(['Today high', 'Today low']);
    expect(run({ due: 'week' })).toEqual(['Today high', 'Today low', 'Upcoming']);
    expect(run({ due: 'none' })).toEqual(['No date high']);
    expect(run({ query: 'resume' })).toEqual(['Today high']);
    expect(run({ query: 'biology' })).toEqual(['Upcoming']);
  });
});

describe('Today’s numbers', () => {
  const data = tasks => ({ classes: [bio], daysOff: [], lessons: [], assignments: [], settings: defaultSettings(), tasks });
  const tasks = [T('Overdue', { due: '2026-11-20' }), T('Today', { due: today, classId: 'bio' }), T('Tomorrow', { due: '2026-11-24', classId: 'bio' }), T('Done', { due: today, done: true }), T('No date', {})];

  it('overdue and due today are separate; done and undated tasks aren’t counted', () => {
    const a = dayAgenda(today, data(tasks), { today });
    expect(a.overdue.map(t => t.title)).toEqual(['Overdue']);
    expect(a.tasksDue.map(t => t.title)).toEqual(['Today']);
    expect(a.upcoming.map(u => [u.kind, u.title, u.class && u.class.name, u.id])).toEqual([['task', 'Tomorrow', 'Biology', 'Tomorrow']]);
  });
  it('on another day: that day’s tasks only; overdue belongs to the real today', () => {
    const a = dayAgenda('2026-11-24', data(tasks), { today });
    expect([a.overdue, a.tasksDue.map(t => t.title)]).toEqual([[], ['Tomorrow']]);
  });
});

describe('the task model', () => {
  it('only the title is required; the class is optional but must exist when given', () => {
    expect(cleanRecord('tasks', { title: 'Copies' }, { strict: true }).record).toMatchObject({ classId: null, due: null, priority: 'normal', done: false });
    expect(cleanRecord('tasks', { title: 'x', classId: '../bad' }, { strict: true }).errors.classId).toBe('Choose one');
    expect(cleanRecord('tasks', { title: 'x', classId: '../bad' }).record.classId).toBeNull(); // loading: dropped, task kept
    const { store } = testStore();
    expect(store.create('tasks', { title: 'x', classId: 'nope' }).errors.classId).toBe('Choose a class');
    const c = store.create('classes', sampleClass()).record;
    expect(store.create('tasks', { title: 'x', classId: c.id }).record.classId).toBe(c.id);
  });

  it('a task whose class is gone can still be completed; it can’t be moved to another missing class', () => {
    const storage = memoryStorage();
    storage.map.set('meta', JSON.stringify({ app: 'TeacherSync', schema: 1 }));
    storage.map.set('tasks', JSON.stringify([T('t1', { classId: 'gone' })]));
    const { store } = testStore(storage);
    expect(orphansOf({ classes: [], lessons: [], assignments: [], tasks: store.all('tasks') })).toBe(1);
    expect(orphansOf({ classes: [], lessons: [], assignments: [], tasks: [T('x', {})] })).toBe(0);
    expect(store.update('tasks', 't1', { done: true }).ok).toBe(true);
    expect(store.update('tasks', 't1', { classId: 'also-gone' }).errors.classId).toBe('Choose a class');
    expect(store.update('tasks', 't1', { classId: null }).record.classId).toBeNull();
  });

  it('tasks saved before Phase 7 load unchanged and aren’t rewritten; backups old and new restore', () => {
    const storage = memoryStorage();
    storage.map.set('meta', JSON.stringify({ app: 'TeacherSync', schema: 1 }));
    const old = [{ id: 't1', title: 'Copies', description: 'x30', due: '2026-11-20', priority: 'high', done: false, doneAt: null, createdAt: 1, updatedAt: 2 }];
    storage.map.set('tasks', JSON.stringify(old));
    const { store } = testStore(storage);
    expect(store.report().problems).toEqual([]);
    expect(store.get('tasks', 't1')).toEqual({ ...old[0], classId: null });
    expect(JSON.parse(storage.get('tasks'))).toEqual(old);
    expect(readBackup({ app: 'TeacherSync', kind: 'backup', schema: 1, data: { tasks: old } }).data.tasks[0]).toMatchObject({ title: 'Copies', classId: null });
    const c = store.create('classes', sampleClass()).record;
    store.create('tasks', { title: 'Linked', classId: c.id, due: '2026-11-30', priority: 'low', description: 'Room 204' });
    const b = testStore();
    expect(b.store.restore(parseBackup(backupText(store.exportData())).data, 'replace').ok).toBe(true);
    expect(b.store.all('tasks')).toEqual(store.all('tasks'));
  });
});

describe('deleting a class', () => {
  it('keeps its tasks as general tasks (after a safety copy); Undo links them again', () => {
    const { store } = testStore();
    const c = store.create('classes', sampleClass()).record;
    const linked = store.create('tasks', { title: 'Bio copies', classId: c.id }).record;
    const general = store.create('tasks', { title: 'Email office' }).record;
    const res = store.remove('classes', c.id);
    expect(res.ok).toBe(true);
    expect(store.all('tasks').map(t => [t.title, t.classId])).toEqual([['Bio copies', null], ['Email office', null]]);
    expect(store.get('tasks', linked.id).updatedAt).toBeGreaterThan(linked.updatedAt);
    expect(store.get('tasks', general.id)).toEqual(general);
    expect(store.snapshots()).toHaveLength(1);
    store.update('tasks', linked.id, { title: 'Bio copies x30' });          // edited in between: kept
    expect(store.restoreRemoved(res.removed).ok).toBe(true);
    expect(store.get('tasks', linked.id)).toMatchObject({ title: 'Bio copies x30', classId: c.id });
    expect(store.get('tasks', general.id).classId).toBeNull();
  });

  it('Undo doesn’t take a task back from a class it was given in the meantime', () => {
    const { store } = testStore();
    const c = store.create('classes', sampleClass()).record;
    const other = store.create('classes', sampleClass({ name: 'Chem' })).record;
    const t = store.create('tasks', { title: 'Copies', classId: c.id }).record;
    const res = store.remove('classes', c.id);
    store.update('tasks', t.id, { classId: other.id });
    store.restoreRemoved(res.removed);
    expect(store.get('tasks', t.id).classId).toBe(other.id);
  });

  it('deleting a task removes only it', () => {
    const { store } = testStore();
    const c = store.create('classes', sampleClass()).record;
    const t = store.create('tasks', { title: 'Copies', classId: c.id }).record;
    expect(store.remove('tasks', t.id).removed).toEqual({ tasks: [t] });
    expect(store.all('classes')).toHaveLength(1);
  });
});
