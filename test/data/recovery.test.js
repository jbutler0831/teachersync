// Missing, damaged, old and too-new saved data.
import { describe, it, expect } from 'vitest';
import { testStore, memoryStorage, sampleClass } from './memory.js';
import { MESSAGES } from '../../src/data/store.js';
import { defaultSettings } from '../../src/data/schema.js';

const withData = entries => { const s = memoryStorage(); for (const [k, v] of Object.entries(entries)) s.map.set(k, typeof v === 'string' ? v : JSON.stringify(v)); return s; };
const META = { app: 'TeacherSync', schema: 1 };
const good = { id: 'c1', name: 'Bio', meetings: [], createdAt: 1, updatedAt: 1 };

describe('loading', () => {
  it('a first start has empty data and default settings, and writes nothing', () => {
    const { store, storage } = testStore();
    expect(store.all('classes')).toEqual([]);
    expect(store.settings()).toEqual(defaultSettings());
    expect(store.report().problems).toEqual([]);
    expect(storage.map.size).toBe(0);
  });

  it('reloads exactly what was saved', () => {
    const { store, storage } = testStore();
    const c = store.create('classes', sampleClass()).record;
    store.create('lessons', { classId: c.id, title: 'Cells', date: '2026-10-27', notes: 'Line 1\nLine 2' });
    store.updateSettings({ gradingDays: 6 });
    const again = testStore(storage).store;
    expect(again.exportData()).toEqual(store.exportData());
    expect(again.report().problems).toEqual([]);
  });

  it('one damaged collection doesn’t affect the others, and its text is kept', () => {
    const storage = withData({ meta: META, classes: [good], lessons: '{not json', tasks: [{ id: 't1', title: 'Copies' }] });
    const { store } = testStore(storage);
    expect(store.all('classes')).toHaveLength(1);
    expect(store.all('tasks')).toHaveLength(1);
    expect(store.all('lessons')).toEqual([]);
    expect(store.report().problems.join(' ')).toMatch(/lesson plans couldn’t be read/);
    expect(store.damagedCopies()).toEqual([expect.objectContaining({ key: 'lessons', raw: '{not json', why: 'unreadable' })]);
    expect(storage.json('lessons')).toEqual([]);   // rewritten clean, after the copy was kept
    expect(store.isReadOnly()).toBe(false);
  });

  it('a collection with the wrong shape is treated as damaged', () => {
    const { store } = testStore(withData({ meta: META, tasks: { title: 'not a list' } }));
    expect(store.all('tasks')).toEqual([]);
    expect(store.damagedCopies()[0].key).toBe('tasks');
  });

  it('unusable records are set aside one by one; good ones are kept', () => {
    const storage = withData({ meta: META, tasks: [{ id: 't1', title: 'Good' }, { id: 't2', title: '' }, 'junk', null, { id: 't3', title: 'Also good', priority: 'urgent' }] });
    const { store } = testStore(storage);
    expect(store.all('tasks').map(t => t.title)).toEqual(['Good', 'Also good']);
    expect(store.all('tasks')[1].priority).toBe('normal');
    expect(store.report().skipped).toBe(3);
    expect(store.report().problems.join(' ')).toMatch(/3 saved items couldn’t be used/);
    expect(store.damagedCopies().map(d => d.raw)).toEqual([JSON.stringify({ id: 't2', title: '' }), '"junk"', 'null']);
    // They're not reported again on the next start.
    expect(testStore(storage).store.report().problems).toEqual([]);
  });

  it('duplicate ids get a new id instead of one copy being lost', () => {
    const { store } = testStore(withData({ meta: META, tasks: [{ id: 'same', title: 'A' }, { id: 'same', title: 'B' }] }));
    const ids = store.all('tasks').map(t => t.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('damaged settings are reset to defaults and kept', () => {
    const { store } = testStore(withData({ meta: META, settings: '"oops"' }));
    expect(store.settings()).toEqual(defaultSettings());
    expect(store.report().problems.join(' ')).toMatch(/settings couldn’t be read/);
  });

  it('a damaged version marker is reported and repaired on the next save', () => {
    const { store, storage } = testStore(withData({ meta: '###', classes: [good] }));
    expect(store.all('classes')).toHaveLength(1);
    expect(store.report().problems).toHaveLength(1);
    store.create('tasks', { title: 'x' });
    expect(storage.json('meta')).toEqual(META);
  });

  it('if the damaged data can’t be kept, nothing is written over it', () => {
    const storage = withData({ meta: META, classes: [good], lessons: '{broken' });
    storage.failKeys.add('damaged');
    const { store } = testStore(storage);
    expect(store.isReadOnly()).toBe(true);
    expect(storage.get('lessons')).toBe('{broken');
    expect(store.create('tasks', { title: 'x' }).errors._).toBe(MESSAGES.readOnly);
    expect(store.report().problems.join(' ')).toMatch(/changes are turned off/);
  });

  it('if the classes can’t be read, their lesson plans are kept and reported', () => {
    const storage = withData({ meta: META, classes: '[{oops', lessons: [{ id: 'L1', classId: 'c1', date: '2026-10-27', title: 'Cells' }] });
    const { store } = testStore(storage);
    expect(store.all('lessons')).toHaveLength(1);
    expect(store.report().orphans).toBe(1);
    expect(store.report().problems.join(' ')).toMatch(/belong to a class that’s missing/);
    expect(storage.json('lessons')).toHaveLength(1);
    // They can be given a class again.
    const c = store.create('classes', { name: 'Bio' }).record;
    expect(store.update('lessons', 'L1', { title: 'Cells 2' }).errors.classId).toBe('Choose a class');
    expect(store.update('lessons', 'L1', { classId: c.id }).ok).toBe(true);
  });

  it('keeps at most 20 damaged copies', () => {
    const storage = withData({ meta: META, tasks: Array.from({ length: 30 }, () => ({ title: '' })) });
    expect(testStore(storage).store.damagedCopies()).toHaveLength(20);
  });
});

describe('older and newer data', () => {
  it('upgrades data from version 0.1 (no version marker, theme under its own key)', () => {
    const storage = withData({ theme: 'dark' });
    const { store } = testStore(storage);
    expect(store.report().migratedFrom).toBe(0);
    expect(store.settings().theme).toBe('dark');
    expect(storage.json('settings').theme).toBe('dark');
    expect(storage.json('meta')).toEqual(META);
    expect(storage.get('theme')).toBeNull();
  });

  it('a damaged 0.1 theme becomes System', () => {
    const { store } = testStore(withData({ theme: 'sparkly' }));
    expect(store.settings().theme).toBe('system');
  });

  it('data from a newer version is shown but never written over', () => {
    const newer = { app: 'TeacherSync', schema: 99 };
    const storage = withData({ meta: newer, classes: [{ ...good, futureField: 'x' }] });
    const before = new Map(storage.map);
    const { store } = testStore(storage);
    expect(store.isReadOnly()).toBe(true);
    expect(store.all('classes')).toHaveLength(1);
    expect(store.report().problems).toContain(MESSAGES.newer);
    expect(store.create('tasks', { title: 'x' }).ok).toBe(false);
    expect(store.updateSettings({ theme: 'dark' }).ok).toBe(false);
    expect(store.restore(store.exportData(), 'replace').ok).toBe(false);
    expect(store.remove('classes', 'c1').ok).toBe(false);
    expect(store.snapshot('manual')).toBeNull();
    expect(storage.map).toEqual(before);
  });
});
