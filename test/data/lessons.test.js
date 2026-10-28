import { describe, it, expect } from 'vitest';
import { matches, filterLessons, groupByDate, nextMeetingDates, copyOf } from '../../src/data/lessons.js';
import { cleanRecord, defaultSettings, LESSON_STATUS } from '../../src/data/schema.js';
import { parseBackup, backupText, readBackup } from '../../src/data/backup.js';
import { testStore, memoryStorage, sampleClass } from './memory.js';

// 2026-11-23 is a Monday.
const bio = { id: 'bio', name: 'Biology', color: 's1', meetings: [{ id: 'm1', day: 1, start: '10:00', end: '10:50' }, { id: 'm2', day: 3, start: '10:00', end: '10:50' }] };
const art = { id: 'art', name: 'Art', color: 's2', meetings: [{ id: 'm3', day: 1, start: '08:00', end: '08:50' }] };
const L = (id, over) => ({ id, classId: 'bio', date: null, title: id, objectives: '', activities: '', materials: '', assessment: '', notes: '', status: 'draft', createdAt: 1, updatedAt: 1, ...over });
const lessons = [
  L('Cells', { date: '2026-11-23', objectives: 'Name the organelles', status: 'ready' }),
  L('Résumé writing', { classId: 'art', date: '2026-11-23', materials: 'Laptops' }),
  L('Old lab', { date: '2026-11-02', status: 'taught', activities: 'Microscope practice' }),
  L('Someday', { updatedAt: 5 }),
  L('Orphan', { classId: 'gone', date: '2026-12-01' }),
];
const today = '2026-11-23';

describe('search', () => {
  it('every word must appear in the plan’s text or its class name; accents and case don’t matter', () => {
    expect(matches(lessons[0], 'organelles')).toBe(true);
    expect(matches(lessons[1], 'RESUME laptops')).toBe(true);
    expect(matches(lessons[1], 'resume microscope')).toBe(false);
    expect(matches(lessons[2], 'microscope')).toBe(true);
    expect(matches(lessons[0], 'biology cells', 'Biology')).toBe(true);
    expect(matches(lessons[0], '   ')).toBe(true);
  });
});

describe('filters', () => {
  const run = f => filterLessons(lessons, [bio, art], f, today).map(l => l.title);
  it('upcoming (the default) is today onward plus plans with no date', () => {
    expect(run({})).toEqual(['Cells', 'Résumé writing', 'Someday', 'Orphan']);
  });
  it('past, no date, all, and one date', () => {
    expect(run({ when: 'past' })).toEqual(['Old lab']);
    expect(run({ when: 'undated' })).toEqual(['Someday']);
    expect(run({ when: 'all' })).toHaveLength(5);
    expect(run({ when: 'day', day: '2026-11-23' })).toEqual(['Cells', 'Résumé writing']);
    expect(run({ when: 'day', day: '' })).toHaveLength(5); // no date picked yet: nothing filtered out
  });
  it('class, missing class, status, and search together', () => {
    expect(run({ when: 'all', classId: 'art' })).toEqual(['Résumé writing']);
    expect(run({ when: 'all', classId: 'missing' })).toEqual(['Orphan']);
    expect(run({ when: 'all', status: 'taught' })).toEqual(['Old lab']);
    expect(run({ when: 'all', status: 'draft', query: 'biology' })).toEqual(['Someday']);
    expect(run({ query: 'nothing like this' })).toEqual([]);
  });
});

describe('grouping by date', () => {
  it('upcoming: soonest first, plans with no date last; within a day, by class time', () => {
    const g = groupByDate(filterLessons(lessons, [bio, art], {}, today), [bio, art], 'upcoming');
    expect(g.map(x => x.date)).toEqual(['2026-11-23', '2026-12-01', null]);
    expect(g[0].lessons.map(l => l.title)).toEqual(['Résumé writing', 'Cells']); // Art meets at 8:00, Biology at 10:00
  });
  it('past and all: most recent first', () => {
    expect(groupByDate(lessons, [bio, art], 'all').map(x => x.date)).toEqual(['2026-12-01', '2026-11-23', '2026-11-02', null]);
  });
});

describe('next meeting dates', () => {
  const data = { classes: [bio], daysOff: [{ id: 'd', title: 'Break', start: '2026-11-25', end: '2026-11-27' }], settings: defaultSettings() };
  it('lists the next days the class meets, skipping days off and crossing months', () => {
    expect(nextMeetingDates('bio', data, '2026-11-23')).toEqual(['2026-11-23', '2026-11-30', '2026-12-02']);
    expect(nextMeetingDates('art', data, '2026-11-23')).toEqual([]);
  });
});

describe('duplicating', () => {
  it('a copy keeps what was written, has no id or date, and starts as a Draft', () => {
    const c = copyOf(lessons[2]);
    expect(c).toEqual({ classId: 'bio', title: 'Old lab', objectives: '', activities: 'Microscope practice', materials: '', assessment: '', notes: '', date: null, status: 'draft' });
    expect(c).not.toHaveProperty('id');
  });
  it('saving a copy makes a new plan and leaves the original alone', () => {
    const { store } = testStore();
    const cls = store.create('classes', sampleClass()).record;
    const orig = store.create('lessons', { classId: cls.id, title: 'Cells', date: '2026-11-23', activities: 'Lab', status: 'taught' }).record;
    const copy = store.create('lessons', { ...copyOf(orig), date: '2026-11-30' }).record;
    expect(copy.id).not.toBe(orig.id);
    expect(store.get('lessons', orig.id)).toEqual(orig);
    expect(copy).toMatchObject({ title: 'Cells', activities: 'Lab', date: '2026-11-30', status: 'draft' });
  });
});

describe('the lesson model', () => {
  it('statuses are Draft, Planned and Taught, stored as before', () => {
    expect(LESSON_STATUS).toEqual([['draft', 'Draft'], ['ready', 'Planned'], ['taught', 'Taught']]);
  });
  it('title and class are required; the date and every text field are optional', () => {
    const { record } = cleanRecord('lessons', { classId: 'c1', title: 'Cells' }, { strict: true });
    expect(record).toMatchObject({ date: null, objectives: '', activities: '', materials: '', assessment: '', notes: '', status: 'draft' });
    const bad = cleanRecord('lessons', { classId: '', title: ' ', date: '2026-02-30' }, { strict: true });
    expect(bad.record).toBeNull();
    expect(bad.errors).toMatchObject({ title: 'Required', classId: 'Choose one', date: 'Not a valid date' });
  });
  it('lesson plans saved before Phase 5 (no activities or assessment) load unchanged', () => {
    const storage = memoryStorage();
    storage.map.set('meta', JSON.stringify({ app: 'TeacherSync', schema: 1 }));
    storage.map.set('classes', JSON.stringify([{ id: 'c1', name: 'Bio', meetings: [], createdAt: 1, updatedAt: 1 }]));
    storage.map.set('lessons', JSON.stringify([{ id: 'L1', classId: 'c1', date: '2026-10-27', title: 'Cells', objectives: 'O', materials: 'M', notes: 'N', status: 'ready', createdAt: 1, updatedAt: 2 }]));
    const { store } = testStore(storage);
    expect(store.report().problems).toEqual([]);
    expect(store.get('lessons', 'L1')).toMatchObject({ title: 'Cells', objectives: 'O', materials: 'M', notes: 'N', status: 'ready', activities: '', assessment: '', updatedAt: 2 });
    expect(storage.get('lessons')).toContain('"objectives":"O"'); // not rewritten just to add empty fields
    expect(JSON.parse(storage.get('lessons'))[0]).not.toHaveProperty('activities');
  });
  it('an older backup restores, and a new backup round-trips every field, including no date', () => {
    const old = { app: 'TeacherSync', kind: 'backup', schema: 1, data: { classes: [{ id: 'c1', name: 'Bio', meetings: [] }], lessons: [{ id: 'L1', classId: 'c1', date: '2026-10-27', title: 'Cells', status: 'ready' }] } };
    const r = readBackup(old);
    expect(r).toMatchObject({ ok: true, skipped: 0 });
    expect(r.data.lessons[0]).toMatchObject({ title: 'Cells', status: 'ready', activities: '' });

    const { store } = testStore();
    const c = store.create('classes', sampleClass()).record;
    store.create('lessons', { classId: c.id, title: 'Full', date: '2026-11-23', objectives: 'O', activities: 'Step 1\nStep 2', materials: 'M', assessment: 'Exit ticket', notes: 'N', status: 'taught' });
    store.create('lessons', { classId: c.id, title: 'Unscheduled' });
    const b = testStore();
    const parsed = parseBackup(backupText(store.exportData()));
    expect(b.store.restore(parsed.data, 'replace').ok).toBe(true);
    expect(b.store.all('lessons')).toEqual(store.all('lessons'));
    expect(b.store.all('lessons')[1].date).toBeNull();
  });
});
