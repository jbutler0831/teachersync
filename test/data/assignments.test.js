import { describe, it, expect, afterEach } from 'vitest';
import { isPastDue, isLate, needsAttention, filterAssignments, viewCounts, NEXT_STEP } from '../../src/data/assignments.js';
import { dayAgenda } from '../../src/data/agenda.js';
import { cleanRecord, defaultSettings } from '../../src/data/schema.js';
import { readBackup, parseBackup, backupText } from '../../src/data/backup.js';
import { iso } from '../../src/lib/dates.js';
import { testStore, memoryStorage, sampleClass } from './memory.js';

const today = '2026-11-23'; // a Monday
const A = (id, over) => ({ id, classId: 'bio', title: id, assigned: null, due: null, gradeBy: null, status: 'assigned', description: '', notes: '', createdAt: 1, updatedAt: 1, ...over });
const bio = { id: 'bio', name: 'Biology', color: 's1', meetings: [] };
const chem = { id: 'chem', name: 'Chemistry', color: 's2', meetings: [] };

describe('status rules', () => {
  it('past due: still Assigned after the due date (not on the due date itself)', () => {
    expect(isPastDue(A('a', { due: '2026-11-22' }), today)).toBe(true);
    expect(isPastDue(A('a', { due: today }), today)).toBe(false);
    expect(isPastDue(A('a', { due: null }), today)).toBe(false);
    for (const status of ['to-grade', 'graded', 'returned']) expect(isPastDue(A('a', { due: '2026-11-01', status }), today)).toBe(false);
  });

  it('late: To grade after the grading deadline; never once graded; never without a deadline', () => {
    expect(isLate(A('a', { status: 'to-grade', gradeBy: '2026-11-22' }), today)).toBe(true);
    expect(isLate(A('a', { status: 'to-grade', gradeBy: today }), today)).toBe(false);
    expect(isLate(A('a', { status: 'to-grade', gradeBy: null }), today)).toBe(false);
    expect(isLate(A('a', { status: 'graded', gradeBy: '2026-11-01' }), today)).toBe(false);
    expect(isLate(A('a', { status: 'returned', gradeBy: '2026-11-01' }), today)).toBe(false);
    expect(isLate(A('a', { status: 'assigned', gradeBy: '2026-11-01' }), today)).toBe(false); // the due date is what counts then
  });

  it('due dates and grading deadlines aren’t confused', () => {
    const a = A('a', { due: '2026-11-30', gradeBy: '2026-11-20', status: 'assigned' }); // odd data: deadline before due
    expect([isPastDue(a, today), isLate(a, today)]).toEqual([false, false]);
  });

  it('needs attention: past due or To grade', () => {
    expect(needsAttention(A('a', { due: '2026-11-01' }), today)).toBe(true);
    expect(needsAttention(A('a', { status: 'to-grade' }), today)).toBe(true);
    expect(needsAttention(A('a', { due: '2026-12-01' }), today)).toBe(false);
    expect(needsAttention(A('a', { status: 'graded', due: '2026-11-01' }), today)).toBe(false);
  });

  it('the grading steps go Assigned → To grade → Graded → Returned', () => {
    expect(Object.entries(NEXT_STEP).map(([from, [to]]) => `${from}>${to}`)).toEqual(['assigned>to-grade', 'to-grade>graded', 'graded>returned']);
  });

  describe('time zones', () => {
    const tz = process.env.TZ;
    afterEach(() => { process.env.TZ = tz; });
    it('late is decided by the teacher’s own calendar day', () => {
      const a = A('a', { status: 'to-grade', gradeBy: '2026-11-23' });
      const moment = new Date(Date.UTC(2026, 10, 24, 3, 30)); // 3:30 UTC on Nov 24
      process.env.TZ = 'America/Los_Angeles';                 // still Nov 23 there: due today, not late
      expect(isLate(a, iso(moment))).toBe(false);
      process.env.TZ = 'Europe/Berlin';                       // already Nov 24: late
      expect(isLate(a, iso(moment))).toBe(true);
    });
  });
});

describe('the list', () => {
  const list = [
    A('Upcoming essay', { classId: 'chem', due: '2026-11-25', description: 'Write about résumés' }),
    A('No due date', {}),
    A('Past due lab', { due: '2026-11-20' }),
    A('Late quiz', { status: 'to-grade', due: '2026-11-10', gradeBy: '2026-11-13' }),
    A('Grade soon', { status: 'to-grade', due: '2026-11-19', gradeBy: '2026-11-24' }),
    A('Grade whenever', { status: 'to-grade', due: '2026-11-18' }),
    A('Graded test', { status: 'graded', due: '2026-11-05', gradeBy: '2026-11-08' }),
    A('Returned map', { status: 'returned', due: '2026-11-12', notes: 'Rubric in drawer' }),
    A('Orphan', { classId: 'gone', due: '2026-11-30' }),
  ];
  const run = f => filterAssignments(list, [bio, chem], f, today).map(a => a.title);

  it('needs attention (the default): late first, then past due, then To grade by deadline', () => {
    expect(run({})).toEqual(['Late quiz', 'Past due lab', 'Grade whenever', 'Grade soon']);
  });
  it('Grade whenever sorts by its due date when it has no grading deadline', () => {
    expect(run({ query: 'grade' }).slice(-2)).toEqual(['Grade whenever', 'Grade soon']);
  });
  it('upcoming: still Assigned and not past due, soonest due first, no due date last', () => {
    expect(run({ view: 'upcoming' })).toEqual(['Upcoming essay', 'Orphan', 'No due date']);
  });
  it('graded and all: most recent due date first, no due date last', () => {
    expect(run({ view: 'done' })).toEqual(['Returned map', 'Graded test']);
    expect(run({ view: 'all' })).toEqual(['Orphan', 'Upcoming essay', 'Past due lab', 'Grade soon', 'Grade whenever', 'Returned map', 'Late quiz', 'Graded test', 'No due date']);
  });
  it('counts per view', () => {
    expect(viewCounts(list, today)).toEqual({ attention: 4, upcoming: 3, done: 2, all: 9 });
  });
  it('search (instructions, notes, class name; no accents), class, missing class, status, and due filters', () => {
    expect(run({ view: 'all', query: 'resume' })).toEqual(['Upcoming essay']);
    expect(run({ view: 'all', query: 'rubric' })).toEqual(['Returned map']);
    expect(run({ view: 'all', query: 'chemistry' })).toEqual(['Upcoming essay']);
    expect(run({ view: 'all', classId: 'chem' })).toEqual(['Upcoming essay']);
    expect(run({ view: 'all', classId: 'missing' })).toEqual(['Orphan']);
    expect(run({ view: 'all', status: 'to-grade' })).toEqual(['Grade soon', 'Grade whenever', 'Late quiz']);
    expect(run({ view: 'all', due: 'week' })).toEqual(['Orphan', 'Upcoming essay']);           // Nov 23–30
    expect(run({ view: 'all', due: 'today' })).toEqual([]);
    expect(run({ view: 'all', due: 'none' })).toEqual(['No due date']);
    expect(run({ view: 'all', due: 'past' })).toHaveLength(6);
  });
});

describe('Today’s numbers', () => {
  const data = over => ({ classes: [bio], daysOff: [], lessons: [], tasks: [], settings: defaultSettings(), assignments: [], ...over });
  const assignments = [
    A('Due today', { due: today }),
    A('Collected early', { due: today, status: 'to-grade', gradeBy: '2026-11-26' }),
    A('Past due', { due: '2026-11-20' }),
    A('Late', { status: 'to-grade', gradeBy: '2026-11-21' }),
    A('Graded late', { status: 'graded', gradeBy: '2026-11-01', due: '2026-11-23' }),
    A('Next week', { due: '2026-11-27' }),
  ];

  it('due on the day, past due, and To grade: each assignment in one group only', () => {
    const a = dayAgenda(today, data({ assignments }), { today });
    expect(a.dueOn.map(x => x.assignment.title)).toEqual(['Due today']);
    expect(a.pastDue.map(x => x.assignment.title)).toEqual(['Past due']);
    expect(a.toGrade.map(x => [x.assignment.title, x.late])).toEqual([['Late', true], ['Collected early', false]]);
    const ids = [...a.dueOn, ...a.pastDue, ...a.toGrade].map(x => x.assignment.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('another day: what’s due that day; past due only on today; the grading pile is the same', () => {
    const a = dayAgenda('2026-11-27', data({ assignments }), { today });
    expect(a.dueOn.map(x => x.assignment.title)).toEqual(['Next week']);
    expect(a.pastDue).toEqual([]);
    expect(a.toGrade.map(x => x.late)).toEqual([true, false]); // late is measured from the real today
  });

  it('the next 7 days list due dates and grading deadlines, with ids to open them', () => {
    const a = dayAgenda(today, data({ assignments }), { today });
    expect(a.upcoming.map(u => `${u.date} ${u.kind} ${u.id}`)).toEqual(['2026-11-26 grade Collected early', '2026-11-27 due Next week']);
  });

  it('with no assignments, nothing is counted', () => {
    const a = dayAgenda(today, data(), { today });
    expect([a.dueOn, a.pastDue, a.toGrade, a.upcoming]).toEqual([[], [], [], []]);
  });
});

describe('the assignment model', () => {
  it('title and class required; instructions, notes and every date optional', () => {
    const { record } = cleanRecord('assignments', { classId: 'c1', title: 'Quiz' }, { strict: true });
    expect(record).toMatchObject({ assigned: null, due: null, gradeBy: null, status: 'assigned', description: '', notes: '' });
    const bad = cleanRecord('assignments', { classId: '', title: '', due: '2026-13-01', status: 'lost' }, { strict: true });
    expect(bad.errors).toMatchObject({ title: 'Required', classId: 'Choose one', due: 'Not a valid date', status: 'Not a valid choice' });
  });

  it('assignments saved before Phase 6 load unchanged and aren’t rewritten', () => {
    const storage = memoryStorage();
    storage.map.set('meta', JSON.stringify({ app: 'TeacherSync', schema: 1 }));
    storage.map.set('classes', JSON.stringify([{ id: 'c1', name: 'Bio', meetings: [], createdAt: 1, updatedAt: 1 }]));
    const old = [{ id: 'a1', classId: 'c1', title: 'Lab', assigned: '2026-11-01', due: '2026-11-08', gradeBy: '2026-11-11', status: 'to-grade', createdAt: 1, updatedAt: 2 }];
    storage.map.set('assignments', JSON.stringify(old));
    const { store } = testStore(storage);
    expect(store.report().problems).toEqual([]);
    expect(store.get('assignments', 'a1')).toMatchObject({ ...old[0], description: '', notes: '' });
    expect(JSON.parse(storage.get('assignments'))).toEqual(old);
  });

  it('an older backup restores; a new backup round-trips every field', () => {
    const r = readBackup({ app: 'TeacherSync', kind: 'backup', schema: 1, data: { classes: [{ id: 'c1', name: 'Bio', meetings: [] }], assignments: [{ id: 'a1', classId: 'c1', title: 'Lab', due: '2026-11-08', status: 'graded' }] } });
    expect(r).toMatchObject({ ok: true, skipped: 0 });
    expect(r.data.assignments[0]).toMatchObject({ title: 'Lab', status: 'graded', description: '', notes: '' });
    const { store } = testStore();
    const c = store.create('classes', sampleClass()).record;
    store.create('assignments', { classId: c.id, title: 'Essay', assigned: '2026-11-01', due: '2026-11-10', gradeBy: '2026-11-15', status: 'returned', description: 'Two pages\nMLA', notes: 'Rubric B' });
    const b = testStore();
    expect(b.store.restore(parseBackup(backupText(store.exportData())).data, 'replace').ok).toBe(true);
    expect(b.store.all('assignments')).toEqual(store.all('assignments'));
  });
});

describe('deleting', () => {
  it('an assignment: only it goes; its class, lesson plans and tasks stay', () => {
    const { store } = testStore();
    const c = store.create('classes', sampleClass()).record;
    const l = store.create('lessons', { classId: c.id, title: 'Cells' }).record;
    const t = store.create('tasks', { title: 'Copies' }).record;
    const a = store.create('assignments', { classId: c.id, title: 'Lab' }).record;
    const other = store.create('assignments', { classId: c.id, title: 'Quiz' }).record;
    expect(store.remove('assignments', a.id).removed).toEqual({ assignments: [a] });
    expect([store.get('classes', c.id), store.get('lessons', l.id), store.get('tasks', t.id), store.get('assignments', other.id)].every(Boolean)).toBe(true);
  });

  it('a class: its assignments go too (after a safety copy), tasks stay, and Undo brings all back', () => {
    const { store } = testStore();
    const c = store.create('classes', sampleClass()).record;
    const keep = store.create('classes', sampleClass({ name: 'Chem' })).record;
    const a = store.create('assignments', { classId: c.id, title: 'Lab' }).record;
    const b = store.create('assignments', { classId: keep.id, title: 'Other' }).record;
    const t = store.create('tasks', { title: 'Copies' }).record;
    const res = store.remove('classes', c.id);
    expect(res.removed.assignments).toEqual([a]);
    expect(store.all('assignments')).toEqual([b]);
    expect(store.get('tasks', t.id)).toEqual(t);
    expect(store.snapshots()).toHaveLength(1);
    store.restoreRemoved(res.removed);
    expect(store.get('assignments', a.id)).toEqual(a);
  });
});
