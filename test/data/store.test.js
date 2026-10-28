import { describe, it, expect, beforeEach } from 'vitest';
import { testStore, memoryStorage, sampleClass } from './memory.js';
import { MESSAGES } from '../../src/data/store.js';

describe('creating, updating and removing', () => {
  let store, storage, cls;
  beforeEach(() => {
    ({ store, storage } = testStore());
    cls = store.create('classes', sampleClass()).record;
  });

  it('creates a class and saves it under tsync-classes with the schema version', () => {
    expect(cls).toMatchObject({ id: 'id1', name: 'Biology 1', room: '204' });
    expect(storage.json('classes')).toEqual([cls]);
    expect(storage.json('meta')).toEqual({ app: 'TeacherSync', schema: 1 });
    expect(store.all('classes')).toEqual([cls]);
    expect(store.get('classes', 'id1')).toEqual(cls);
  });

  it('every key it writes is one of its own', () => {
    store.create('tasks', { title: 'Copies' });
    expect([...storage.map.keys()].sort()).toEqual(['classes', 'meta', 'tasks']);
  });

  it('ignores ids and timestamps passed in', () => {
    const r = store.create('tasks', { title: 'Call', id: 'mine', createdAt: 1 }).record;
    expect(r.id).not.toBe('mine');
    expect(r.createdAt).toBeGreaterThan(1);
  });

  it('returns field errors and saves nothing when input is invalid', () => {
    const res = store.create('lessons', { classId: cls.id, title: '', date: '2026-02-30' });
    expect(res.ok).toBe(false);
    expect(res.errors).toMatchObject({ title: 'Required', date: 'Not a valid date' });
    expect(store.all('lessons')).toEqual([]);
    expect(storage.get('lessons')).toBeNull();
  });

  it('lessons and assignments must belong to an existing class', () => {
    expect(store.create('lessons', { classId: 'nope', title: 'Cells', date: '2026-10-27' }).errors.classId).toBe('Choose a class');
    expect(store.create('lessons', { classId: cls.id, title: 'Cells', date: '2026-10-27' }).ok).toBe(true);
  });

  it('updates keep the id and creation time and move updatedAt forward', () => {
    const u = store.update('classes', cls.id, { room: '210', id: 'hijack', createdAt: 1 }).record;
    expect(u).toMatchObject({ id: cls.id, room: '210', name: 'Biology 1', createdAt: cls.createdAt });
    expect(u.updatedAt).toBeGreaterThan(cls.updatedAt);
    expect(storage.json('classes')[0].room).toBe('210');
  });

  it('an invalid update changes nothing', () => {
    const res = store.update('classes', cls.id, { name: '' });
    expect(res.errors.name).toBe('Required');
    expect(store.get('classes', cls.id).name).toBe('Biology 1');
  });

  it('updating or removing something that doesn’t exist says so', () => {
    expect(store.update('tasks', 'gone', { title: 'x' }).ok).toBe(false);
    expect(store.remove('tasks', 'gone').ok).toBe(false);
    expect(() => store.all('students')).toThrow(/Unknown collection/);
  });

  it('records can’t be changed by accident', () => {
    expect(Object.isFrozen(cls)).toBe(true);
    expect(Object.isFrozen(cls.meetings[0])).toBe(true);
  });

  it('removes a task and can put it back (Undo)', () => {
    const t = store.create('tasks', { title: 'Copies' }).record;
    const res = store.remove('tasks', t.id);
    expect(res.removed).toEqual({ tasks: [t] });
    expect(store.all('tasks')).toEqual([]);
    expect(store.restoreRemoved(res.removed).ok).toBe(true);
    expect(store.all('tasks')).toEqual([t]);
  });

  it('removing a class removes its lessons and assignments after a safety copy, and Undo brings all back', () => {
    const other = store.create('classes', sampleClass({ name: 'Chem' })).record;
    const l1 = store.create('lessons', { classId: cls.id, title: 'Cells', date: '2026-10-27' }).record;
    const l2 = store.create('lessons', { classId: other.id, title: 'Atoms', date: '2026-10-27' }).record;
    const a1 = store.create('assignments', { classId: cls.id, title: 'Lab report' }).record;
    const res = store.remove('classes', cls.id);
    expect(res.removed).toEqual({ classes: [cls], lessons: [l1], assignments: [a1] });
    expect(store.all('lessons')).toEqual([l2]);
    expect(store.all('assignments')).toEqual([]);
    const snaps = store.snapshots();
    expect(snaps).toHaveLength(1);
    expect(snaps[0].reason).toMatch(/Biology 1/);
    expect(snaps[0].counts).toMatchObject({ classes: 2, lessons: 2, assignments: 1 });
    store.restoreRemoved(res.removed);
    expect(store.all('lessons')).toHaveLength(2);
    expect(store.get('assignments', a1.id)).toEqual(a1);
  });

  it('Undo doesn’t bring back a lesson whose class has been removed since', () => {
    const l = store.create('lessons', { classId: cls.id, title: 'Cells', date: '2026-10-27' }).record;
    const t = store.create('tasks', { title: 'Copies' }).record;
    const lesson = store.remove('lessons', l.id).removed;
    store.remove('classes', cls.id);
    expect(store.restoreRemoved({ ...lesson, tasks: [t] }).ok).toBe(true);
    expect(store.all('lessons')).toEqual([]);
    expect(store.get('tasks', t.id)).toEqual(t); // still there; nothing to put back
  });

  it('settings can’t be changed by accident either', () => {
    expect(Object.isFrozen(store.settings())).toBe(true);
    expect(Object.isFrozen(store.settings().schedule)).toBe(true);
  });

  it('tells subscribers what changed', () => {
    const seen = [];
    const off = store.subscribe(c => seen.push(c));
    store.create('tasks', { title: 'A' });
    store.updateSettings({ gradingDays: 5 });
    off();
    store.create('tasks', { title: 'B' });
    expect(seen).toEqual([['tasks'], ['settings']]);
  });
});

describe('every kind of record', () => {
  const samples = classId => ({
    classes: [sampleClass(), { subject: 'Chemistry' }],
    daysOff: [{ title: 'Winter break', start: '2026-12-21', end: '2027-01-01', kind: 'break' }, { title: 'In-service day' }],
    lessons: [{ classId, date: '2026-10-27', title: 'Cells', objectives: 'Name 3 organelles', materials: 'Microscopes', notes: 'Lab B', status: 'ready' }, { classId, date: '2026-10-28' }],  // no title
    assignments: [{ classId, title: 'Lab report', assigned: '2026-10-20', due: '2026-10-27', gradeBy: '2026-10-30', status: 'to-grade' }, { title: 'Quiz' }],
    tasks: [{ title: 'Copies', description: '30 copies', due: '2026-10-28', priority: 'high' }, { title: '', priority: 'high' }],
  });
  const firstField = { classes: 'name', daysOff: 'title', lessons: 'title', assignments: 'title', tasks: 'title' };

  it('each can be created, updated, removed, and survives a reload', () => {
    const { store, storage } = testStore();
    const cls = store.create('classes', sampleClass({ name: 'Home class' })).record;
    for (const [c, [good, bad]] of Object.entries(samples(cls.id))) {
      const made = store.create(c, good);
      expect(made.ok, c).toBe(true);
      expect(store.create(c, bad).ok, `${c} rejects incomplete input`).toBe(false);
      const f = firstField[c];
      expect(store.update(c, made.record.id, { [f]: 'Renamed' }).record[f]).toBe('Renamed');
      expect(testStore(storage).store.get(c, made.record.id)[f]).toBe('Renamed');
      expect(store.remove(c, made.record.id).ok).toBe(true);
      expect(store.get(c, made.record.id)).toBeNull();
      expect(testStore(storage).store.get(c, made.record.id)).toBeNull();
    }
  });
});

describe('type rules', () => {
  let store, cls;
  beforeEach(() => { ({ store } = testStore()); cls = store.create('classes', sampleClass()).record; });

  it('a new assignment’s grading deadline defaults to due + the days in Settings', () => {
    store.updateSettings({ gradingDays: 4 });
    const a = store.create('assignments', { classId: cls.id, title: 'Quiz', due: '2026-10-28' }).record;
    expect(a).toMatchObject({ gradeBy: '2026-11-01', status: 'assigned' });
    const none = store.create('assignments', { classId: cls.id, title: 'Reading' }).record;
    expect(none.gradeBy).toBeNull();
    const own = store.create('assignments', { classId: cls.id, title: 'Essay', due: '2026-10-28', gradeBy: '2026-11-10' }).record;
    expect(own.gradeBy).toBe('2026-11-10');
  });

  it('an unusable due date never produces a made-up grading deadline', () => {
    const res = store.create('assignments', { classId: cls.id, title: 'Quiz', due: 'soon' });
    expect(res.errors).toEqual({ due: 'Not a valid date' });
  });

  it('moving the due date moves a default grading deadline, but not one the teacher set', () => {
    const a = store.create('assignments', { classId: cls.id, title: 'Quiz', due: '2026-10-28' }).record;
    expect(store.update('assignments', a.id, { due: '2026-10-30' }).record.gradeBy).toBe('2026-11-02');
    const b = store.create('assignments', { classId: cls.id, title: 'Essay', due: '2026-10-28', gradeBy: '2026-11-10' }).record;
    expect(store.update('assignments', b.id, { due: '2026-10-30' }).record.gradeBy).toBe('2026-11-10');
  });

  it('assignment status moves through the grading steps', () => {
    const a = store.create('assignments', { classId: cls.id, title: 'Quiz' }).record;
    for (const s of ['to-grade', 'graded', 'returned']) expect(store.update('assignments', a.id, { status: s }).record.status).toBe(s);
    expect(store.update('assignments', a.id, { status: 'lost' }).errors.status).toBeTruthy();
  });

  it('completing a task records when; reopening clears it', () => {
    const t = store.create('tasks', { title: 'Copies', priority: 'high', due: '2026-10-30' }).record;
    expect(t).toMatchObject({ done: false, doneAt: null, priority: 'high' });
    const done = store.update('tasks', t.id, { done: true }).record;
    expect(done.doneAt).toBeGreaterThan(0);
    expect(store.update('tasks', t.id, { title: 'Copies x30' }).record.doneAt).toBe(done.doneAt);
    expect(store.update('tasks', t.id, { done: false }).record.doneAt).toBeNull();
  });

  it('lesson status: Draft, Ready, Taught', () => {
    const l = store.create('lessons', { classId: cls.id, title: 'Cells', date: '2026-10-27', objectives: 'Name 3 organelles', materials: 'Microscopes' }).record;
    expect(l.status).toBe('draft');
    expect(store.update('lessons', l.id, { status: 'taught' }).record.status).toBe('taught');
  });

  it('a day off’s last day defaults to its first, and can’t come before it', () => {
    const d = store.create('daysOff', { title: 'Thanksgiving', start: '2026-11-26', kind: 'holiday' }).record;
    expect(d.end).toBe('2026-11-26');
    expect(store.create('daysOff', { title: 'Break', start: '2026-12-21', end: '2026-12-01' }).errors.end).toBeTruthy();
  });

  it('limits how many items can be added', () => {
    for (let i = 0; i < 59; i++) store.create('classes', sampleClass({ name: `C${i}` }));
    expect(store.all('classes')).toHaveLength(60);
    expect(store.create('classes', sampleClass()).errors._).toMatch(/up to 60 classes/);
  });

  it('settings: saved, checked, and errors don’t change them', () => {
    expect(store.updateSettings({ weekStartsOn: 0, gradingDays: '7' }).settings).toMatchObject({ weekStartsOn: 0, gradingDays: 7 });
    const bad = store.updateSettings({ gradingDays: 100 });
    expect(bad.errors.gradingDays).toBeTruthy();
    expect(store.settings().gradingDays).toBe(7);
  });
});

describe('when saving fails', () => {
  it('nothing changes and the result says why', () => {
    const { store, storage } = testStore();
    const cls = store.create('classes', sampleClass()).record;
    storage.failWrites = true;
    const res = store.create('tasks', { title: 'Copies' });
    expect(res).toEqual({ ok: false, errors: { _: MESSAGES.saveFailed } });
    expect(store.all('tasks')).toEqual([]);
    expect(store.update('classes', cls.id, { name: 'X' }).ok).toBe(false);
    expect(store.get('classes', cls.id).name).toBe('Biology 1');
  });

  it('a change across several collections is all-or-nothing', () => {
    const { store, storage } = testStore();
    const cls = store.create('classes', sampleClass()).record;
    store.create('lessons', { classId: cls.id, title: 'Cells', date: '2026-10-27' });
    const lessonsBefore = storage.get('lessons');
    storage.failKeys.add('classes'); // lessons are written first, then classes fails
    const res = store.remove('classes', cls.id);
    expect(res.ok).toBe(false);
    expect(storage.get('lessons')).toBe(lessonsBefore);
    expect(store.all('lessons')).toHaveLength(1);
    expect(store.all('classes')).toHaveLength(1);
  });

  it('a full device: refuses a change that doesn’t fit', () => {
    const storage = memoryStorage({ quota: 3000 });
    const { store } = testStore(storage);
    let res;
    for (let i = 0; i < 100 && (!res || res.ok); i++) res = store.create('tasks', { title: `Task number ${i}`, description: 'x'.repeat(100) });
    expect(res.errors._).toBe(MESSAGES.saveFailed);
    const shown = store.all('tasks');
    expect(shown.length).toBeGreaterThan(0);
    // What's on screen is exactly what was saved.
    expect(testStore(storage).store.all('tasks')).toEqual(shown);
  });
});
