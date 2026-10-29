import { describe, it, expect, beforeEach } from 'vitest';
import { testStore, memoryStorage, sampleClass } from './memory.js';
import { makeBackup, backupText, backupFileName, parseBackup, readBackup, mergeData, describeCounts, countsOf } from '../../src/data/backup.js';
import { MESSAGES } from '../../src/data/store.js';

function fill(store) {
  const c = store.create('classes', sampleClass()).record;
  const c2 = store.create('classes', sampleClass({ name: 'Chemistry', color: 's2', meetings: [] })).record;
  store.create('daysOff', { title: 'Thanksgiving break', start: '2026-11-25', end: '2026-11-27', kind: 'break' });
  store.create('lessons', { classId: c.id, date: '2026-10-27', title: 'Cells', objectives: 'Name 3 organelles\nDraw a cell', materials: 'Microscopes', notes: 'Lab B', status: 'ready' });
  store.create('lessons', { classId: c2.id, date: '2026-10-28', title: 'Atoms' });
  store.create('assignments', { classId: c.id, title: 'Lab report', assigned: '2026-10-20', due: '2026-10-27', status: 'to-grade' });
  const t = store.create('tasks', { title: 'Copies', description: '30 copies of the worksheet', due: '2026-10-28', priority: 'high' }).record;
  store.update('tasks', t.id, { done: true });
  store.updateSettings({ theme: 'dark', weekStartsOn: 0, gradingDays: 5 });
  return { c, c2 };
}

describe('export', () => {
  it('a backup names the app and schema and has every collection and the settings', () => {
    const { store } = testStore();
    fill(store);
    const b = makeBackup(store.exportData(), Date.UTC(2026, 9, 27));
    expect(b).toMatchObject({ app: 'TeacherSync', kind: 'backup', schema: 1, exportedAt: '2026-10-27T00:00:00.000Z' });
    expect(Object.keys(b.data)).toEqual(['classes', 'daysOff', 'lessons', 'assignments', 'tasks', 'settings']);
    expect(countsOf(b.data)).toEqual({ classes: 2, daysOff: 1, lessons: 2, assignments: 1, tasks: 1 });
    expect(backupFileName(new Date(2026, 9, 27, 15).getTime())).toBe('TeacherSync-backup-2026-10-27.json');
  });

  it('describes what’s in it', () => {
    expect(describeCounts({ classes: 1, daysOff: 0, lessons: 12, assignments: 0, tasks: 2 })).toBe('1 class, 12 lesson plans and 2 tasks');
    expect(describeCounts({ daysOff: 2 })).toBe('2 days off');
    expect(describeCounts({})).toBe('nothing');
  });
});

describe('restore', () => {
  let a, b;
  beforeEach(() => { a = testStore(); b = testStore(); fill(a.store); });

  it('export, then restore on another device: everything comes back exactly', () => {
    const parsed = parseBackup(backupText(a.store.exportData()));
    expect(parsed).toMatchObject({ ok: true, skipped: 0, counts: { classes: 2, lessons: 2 } });
    expect(b.store.restore(parsed.data, 'replace').ok).toBe(true);
    expect(b.store.exportData()).toEqual(a.store.exportData());
    // And survives a reload there.
    expect(testStore(b.storage).store.exportData()).toEqual(a.store.exportData());
  });

  it('replace saves a safety copy first, which brings back what was there', () => {
    b.store.create('tasks', { title: 'Only on B' });
    const before = b.store.exportData();
    expect(b.store.restore(readBackup(makeBackup(a.store.exportData())).data, 'replace').ok).toBe(true);
    expect(b.store.all('tasks').map(t => t.title)).toEqual(['Copies']);
    const [snap] = b.store.snapshots();
    expect(snap.reason).toBe('Before restoring a backup');
    expect(b.store.restoreSnapshot(snap.id).ok).toBe(true);
    expect(b.store.exportData()).toEqual(before);
    // Going back saved its own safety copy too.
    expect(b.store.snapshots()).toHaveLength(2);
  });

  it('merge adds what’s missing, keeps the newer copy of shared items, and keeps settings', () => {
    const backup = readBackup(makeBackup(a.store.exportData())).data;
    b.store.restore(backup, 'replace');
    b.store.updateSettings({ theme: 'light' });
    const lesson = b.store.all('lessons')[0];
    b.store.update('lessons', lesson.id, { notes: 'Edited later on B' });
    b.store.create('tasks', { title: 'Only on B' });
    const extra = a.store.create('tasks', { title: 'New on A' }).record;
    const res = b.store.restore(readBackup(makeBackup(a.store.exportData())).data, 'merge');
    expect(res.summary).toEqual({ added: 1, updated: 0, unchanged: 7 }); // A's 7 other items are already on B
    expect(b.store.get('lessons', lesson.id).notes).toBe('Edited later on B');
    expect(b.store.get('tasks', extra.id)).toBeTruthy();
    expect(b.store.all('tasks').map(t => t.title).sort()).toEqual(['Copies', 'New on A', 'Only on B']);
    expect(b.store.settings().theme).toBe('light');
  });

  it('merge takes the backup’s copy when it was changed more recently', () => {
    const cur = { classes: [{ id: 'x', name: 'Old', updatedAt: 5 }], daysOff: [], lessons: [], assignments: [], tasks: [], settings: {} };
    const inc = { classes: [{ id: 'x', name: 'New', updatedAt: 9 }, { id: 'y', name: 'Added', updatedAt: 1 }], daysOff: [], lessons: [], assignments: [], tasks: [] };
    const { data, summary } = mergeData(cur, inc);
    expect(data.classes.map(c => c.name)).toEqual(['New', 'Added']);
    expect(summary).toEqual({ added: 1, updated: 1, unchanged: 0 });
  });

  it('restore checks and cleans what it’s given, even without readBackup', () => {
    const res = b.store.restore({ tasks: [{ title: '  Spaced   out ' }, { title: '' }, 'junk'], classes: 'nope', settings: { theme: 'neon', gradingDays: 9 } }, 'replace');
    expect(res.ok).toBe(true);
    expect(b.store.all('tasks').map(t => t.title)).toEqual(['Spaced out']);
    expect(b.store.all('classes')).toEqual([]);
    expect(b.store.settings()).toMatchObject({ theme: 'system', gradingDays: 9 });
    expect(b.storage.json('tasks')[0]).toEqual(b.store.all('tasks')[0]);
  });

  it('replacing keeps when this device last exported', () => {
    b.store.updateSettings({ lastExportAt: 123456 });
    b.store.create('tasks', { title: 'x' });
    b.store.restore(readBackup(makeBackup({ ...a.store.exportData(), settings: { ...a.store.settings(), lastExportAt: null } })).data, 'replace');
    expect(b.store.settings()).toMatchObject({ theme: 'dark', lastExportAt: 123456 });
  });

  it('restoring into an empty device needs no safety copy', () => {
    expect(b.store.restore(readBackup(makeBackup(a.store.exportData())).data, 'replace').ok).toBe(true);
    expect(b.store.snapshots()).toEqual([]);
  });

  it('if a safety copy can’t be saved, nothing is restored', () => {
    b.store.create('tasks', { title: 'Keep me' });
    b.storage.failKeys.add('snapshots');
    const res = b.store.restore(readBackup(makeBackup(a.store.exportData())).data, 'replace');
    expect(res.errors._).toBe(MESSAGES.noSafetyCopy);
    expect(b.store.all('tasks').map(t => t.title)).toEqual(['Keep me']);
  });

  it('keeps the 10 newest safety copies and drops old ones to fit', () => {
    b.store.create('tasks', { title: 'x' });
    for (let i = 0; i < 12; i++) b.store.snapshot(`copy ${i}`);
    const snaps = b.store.snapshots();
    expect(snaps).toHaveLength(10);
    expect(snaps[0].reason).toBe('copy 11');
    const tight = testStore(memoryStorage({ quota: 9000 }));
    tight.store.create('tasks', { title: 'y', description: 'z'.repeat(1500) });
    for (let i = 0; i < 6; i++) expect(tight.store.snapshot(`s${i}`)).toBeTruthy();
    expect(tight.store.snapshots().length).toBeLessThan(6);
    expect(tight.store.snapshots()[0].reason).toBe('s5');
  });
});

describe('reading backup files', () => {
  const valid = () => makeBackup({ classes: [], daysOff: [], lessons: [], assignments: [], tasks: [], settings: {} });

  it('refuses files that aren’t TeacherSync backups, with a reason', () => {
    expect(parseBackup('').error).toMatch(/isn’t a TeacherSync backup/);
    expect(parseBackup('{oops').error).toMatch(/damaged/);
    expect(parseBackup('[1,2]').error).toMatch(/isn’t a TeacherSync backup/);
    expect(parseBackup(JSON.stringify({ app: 'Other' })).error).toMatch(/isn’t a TeacherSync backup/);
    expect(parseBackup(JSON.stringify({ app: 'SemesterSync', format: 1, courses: [] })).error).toMatch(/SemesterSync backup/);
    expect(parseBackup(JSON.stringify({ courses: [] })).error).toMatch(/SemesterSync backup/);
    expect(parseBackup(JSON.stringify({ ...valid(), schema: 7 })).error).toMatch(/newer version/);
    expect(parseBackup(JSON.stringify({ ...valid(), data: null })).error).toMatch(/damaged/);
    expect(parseBackup('x'.repeat(20_000_001)).error).toMatch(/too large/);
  });

  it('skips damaged items, counts them, and keeps the rest', () => {
    const b = valid();
    b.data.tasks = [{ id: 't1', title: 'Fine' }, { title: '' }, 5];
    b.data.classes = [{ id: 'c1', name: 'Bio', meetings: [{ day: 1, start: '8:00', end: '9:00' }, { day: 'x' }] }];
    const r = parseBackup(JSON.stringify(b));
    expect(r.ok).toBe(true);
    expect(r.skipped).toBe(2);
    expect(r.data.tasks.map(t => t.title)).toEqual(['Fine']);
    expect(r.data.classes[0].meetings).toHaveLength(1);
  });

  it('can’t write anything except TeacherSync’s own collections', () => {
    const { store, storage } = testStore();
    storage.map.set('snapshots', '[]');
    storage.map.set('unrelated', 'keep me');
    const hostile = JSON.parse(JSON.stringify(valid()));
    Object.assign(hostile.data, { snapshots: 'overwrite', damaged: 'overwrite', meta: { schema: 99 }, unrelated: 'gone', students: [{ name: 'A' }] });
    hostile.data.tasks = [JSON.parse('{"title":"ok","__proto__":{"polluted":1},"isAdmin":true}')];
    hostile.data.settings = { theme: 'dark', apiUrl: 'https://evil.example' };
    const r = parseBackup(JSON.stringify(hostile));
    expect(Object.keys(r.data)).toEqual(['classes', 'daysOff', 'lessons', 'assignments', 'tasks', 'settings']);
    expect(Object.keys(r.data.tasks[0])).not.toContain('isAdmin');
    expect(r.data.settings).not.toHaveProperty('apiUrl');
    store.restore(r.data, 'replace');
    expect(storage.get('unrelated')).toBe('keep me');
    expect(storage.get('snapshots')).toBe('[]');
    expect(storage.json('meta')).toEqual({ app: 'TeacherSync', schema: 1 });
    expect(storage.get('students')).toBeNull();
    expect({}.polluted).toBeUndefined();
  });

  it('keeps and counts lesson plans whose class isn’t in the file', () => {
    const b = valid();
    b.data.lessons = [{ id: 'L1', classId: 'gone', date: '2026-10-27', title: 'Cells' }];
    const r = parseBackup(JSON.stringify(b));
    expect(r).toMatchObject({ ok: true, skipped: 0, orphans: 1 });
    expect(r.data.lessons).toHaveLength(1);
  });

  it('a backup from an older schema is upgraded', () => {
    const old = { app: 'TeacherSync', kind: 'backup', schema: 0, data: { tasks: [{ title: 'Old task' }], settings: { theme: 'dark' } } };
    const r = readBackup(old);
    expect(r.ok).toBe(true);
    expect(r.data.tasks[0].title).toBe('Old task');
    expect(r.data.settings.theme).toBe('dark');
  });
});

describe('exports never drop data (Phase 9)', () => {
  const META = v => JSON.stringify({ app: 'TeacherSync', schema: v });

  it('normally: this version’s data, with nothing extra', () => {
    const { store } = testStore();
    store.create('tasks', { title: 'Copies' });
    const b = JSON.parse(backupText(store.backupData()));
    expect(b.schema).toBe(1);
    expect(b).not.toHaveProperty('unreadable');
    expect(Object.keys(b.data)).toEqual(['classes', 'daysOff', 'lessons', 'assignments', 'tasks', 'settings']);
    expect(b.data.tasks[0].title).toBe('Copies');
  });

  it('data from a newer version is exported exactly as stored, in that version, extra keys and fields included', () => {
    const storage = memoryStorage();
    storage.map.set('meta', META(7));
    storage.map.set('classes', JSON.stringify([{ id: 'c1', name: 'Bio', meetings: [], createdAt: 1, updatedAt: 1, futureField: { keep: true } }]));
    storage.map.set('tasks', JSON.stringify([{ id: 't1', title: 'x', futureStatus: 'snoozed', createdAt: 1, updatedAt: 1 }]));
    storage.map.set('rubrics', JSON.stringify([{ id: 'r1', name: 'A new kind of record' }]));
    storage.map.set('snapshots', JSON.stringify([{ id: 's', backup: {} }]));
    storage.map.set('unrelated-but-ours', 'not json');
    const before = new Map(storage.map);
    const { store } = testStore(storage);
    expect(store.isReadOnly()).toBe(true);
    const b = JSON.parse(backupText(store.backupData()));
    expect(b.schema).toBe(7);                                             // not mislabelled as this version
    expect(b.data.classes[0].futureField).toEqual({ keep: true });
    expect(b.data.tasks[0].futureStatus).toBe('snoozed');
    expect(b.data.rubrics).toEqual([{ id: 'r1', name: 'A new kind of record' }]);
    expect(b.unreadable).toEqual({ 'unrelated-but-ours': 'not json' });
    expect(b.data).not.toHaveProperty('snapshots');
    expect(storage.map).toEqual(before);                                  // exporting wrote nothing
    expect(parseBackup(backupText(store.backupData())).error).toMatch(/newer version/); // and it isn't half-restored here
  });

  it('damaged data that couldn’t be set aside is exported too, as the original text', () => {
    const storage = memoryStorage();
    storage.map.set('meta', META(1));
    storage.map.set('classes', JSON.stringify([{ id: 'c1', name: 'Bio', meetings: [], createdAt: 1, updatedAt: 1 }]));
    storage.map.set('lessons', '{broken json');
    storage.failKeys.add('damaged');
    const { store } = testStore(storage);
    expect(store.isReadOnly()).toBe(true);
    const b = JSON.parse(backupText(store.backupData()));
    expect(b.unreadable).toEqual({ lessons: '{broken json' });
    expect(b.data.classes[0].name).toBe('Bio');
    expect(storage.get('lessons')).toBe('{broken json');
    // Restoring that file elsewhere brings back what can be read.
    const other = testStore();
    const parsed = parseBackup(backupText(store.backupData()));
    expect(parsed.ok).toBe(true);
    expect(other.store.restore(parsed.data, 'replace').ok).toBe(true);
    expect(other.store.all('classes')).toHaveLength(1);
  });
});

describe('restore limits (Phase 9)', () => {
  const many = (n, make) => Array.from({ length: n }, (_, i) => make(i));

  it('a backup over a limit is refused before anything changes; nothing is trimmed', () => {
    const { store, storage } = testStore();
    store.create('tasks', { title: 'Mine' });
    const before = new Map(storage.map);
    const big = { classes: many(61, i => ({ id: `c${i}`, name: `Class ${i}`, meetings: [] })) };
    const res = store.restore(big, 'replace');
    expect(res.ok).toBe(false);
    expect(res.errors._).toBe('Nothing was restored: this would make 61 classes (TeacherSync holds up to 60).');
    expect(storage.map).toEqual(before);                    // not even a safety copy
    expect(store.all('tasks').map(t => t.title)).toEqual(['Mine']);
  });

  it('a merge that would go over a limit is refused too; one that fits goes ahead', () => {
    const { store } = testStore();
    for (let i = 0; i < 50; i++) store.create('classes', { name: `Mine ${i}` });
    expect(store.restore({ classes: many(11, i => ({ id: `n${i}`, name: `New ${i}`, meetings: [] })) }, 'merge').errors._).toMatch(/61 classes/);
    expect(store.all('classes')).toHaveLength(50);
    expect(store.restore({ classes: many(10, i => ({ id: `n${i}`, name: `New ${i}`, meetings: [] })) }, 'merge').ok).toBe(true);
    expect(store.all('classes')).toHaveLength(60);
  });
});

describe('safety copies for large data (Phase 9)', () => {
  it('when one copy alone is over the safety-copy limit, it’s still kept if there’s room, so a restore can go ahead', () => {
    const { store, storage } = testStore();
    const c = store.create('classes', { name: 'Bio' }).record;
    for (let i = 0; i < 400; i++) store.create('lessons', { classId: c.id, title: `Lesson ${i}`, activities: 'x'.repeat(4000) });
    expect(JSON.stringify(store.exportData()).length).toBeGreaterThan(1_500_000);
    const res = store.restore({ tasks: [{ title: 'From a backup' }] }, 'replace');
    expect(res.ok).toBe(true);
    expect(store.snapshots()).toHaveLength(1);
    expect(store.snapshots()[0].counts.lessons).toBe(400);
    expect(storage.get('snapshots').length).toBeGreaterThan(1_500_000);
    expect(store.restoreSnapshot(store.snapshots()[0].id).ok).toBe(true); // and it brings everything back
    expect(store.all('lessons')).toHaveLength(400);
    // Going back saved a copy of what was there (one task); the large copy, now live again, made room for it.
    expect(store.snapshots().map(x => x.counts.tasks)).toEqual([1]);
  });

  it('when the device has no room even for that, nothing is changed', () => {
    const storage = memoryStorage({ quota: 2_200_000 });
    const { store } = testStore(storage);
    const c = store.create('classes', { name: 'Bio' }).record;
    for (let i = 0; i < 400; i++) store.create('lessons', { classId: c.id, title: `Lesson ${i}`, activities: 'x'.repeat(4000) });
    const res = store.restore({ tasks: [{ title: 'From a backup' }] }, 'replace');
    expect(res.errors._).toBe(MESSAGES.noSafetyCopy);
    expect(store.all('lessons')).toHaveLength(400);
  });
});
