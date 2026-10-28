import { describe, it, expect, afterEach } from 'vitest';
import { dayAgenda, nextClassDay, relativeDay } from '../../src/data/agenda.js';
import { defaultSettings } from '../../src/data/schema.js';
import { iso } from '../../src/lib/dates.js';
import { testStore, sampleClass } from './memory.js';

// 2026-11-23 is a Monday.
const bio = { id: 'bio', name: 'Biology', color: 's1', meetings: [{ id: 'm1', day: 1, start: '10:00', end: '10:50' }, { id: 'm2', day: 3, start: '10:00', end: '10:50' }] };
const art = { id: 'art', name: 'Art', color: 's2', meetings: [{ id: 'm3', day: 1, start: '08:00', end: '08:50' }] };
const base = over => ({ classes: [bio, art], daysOff: [], lessons: [], assignments: [], tasks: [], settings: defaultSettings(), ...over });
const task = (id, due, over = {}) => ({ id, title: id, due, done: false, priority: 'normal', ...over });
const asg = (id, over) => ({ id, title: id, classId: 'bio', assigned: null, due: null, gradeBy: null, status: 'assigned', ...over });

describe('the day’s classes', () => {
  it('lists the classes meeting that day in time order, each with its lesson plans', () => {
    const lessons = [{ id: 'L1', classId: 'bio', date: '2026-11-23', title: 'Cells', status: 'ready' }, { id: 'L2', classId: 'bio', date: '2026-11-24', title: 'Other day', status: 'draft' }];
    const a = dayAgenda('2026-11-23', base({ lessons }));
    expect(a.schedule.map(x => x.class.name)).toEqual(['Art', 'Biology']);
    expect(a.schedule[1].lessons.map(l => l.title)).toEqual(['Cells']);
    expect(a.schedule[0].lessons).toEqual([]);
    expect(a.otherLessons).toEqual([]);
    expect(dayAgenda('2026-11-24', base()).schedule).toEqual([]); // Tuesday
  });

  it('on a day off: no classes, the day off, and that day’s lesson plans listed separately', () => {
    const daysOff = [{ id: 'd', title: 'Thanksgiving break', start: '2026-11-25', end: '2026-11-27', kind: 'break' }];
    const lessons = [{ id: 'L1', classId: 'bio', date: '2026-11-25', title: 'Planned before the break', status: 'draft' }];
    const a = dayAgenda('2026-11-25', base({ daysOff, lessons }));
    expect(a.dayOff.title).toBe('Thanksgiving break');
    expect(a.schedule).toEqual([]);
    expect(a.otherLessons).toEqual([{ lesson: lessons[0], class: bio }]);
    expect(a.draftLessons).toBe(1);
  });

  it('a lesson plan whose class is missing is still shown', () => {
    const a = dayAgenda('2026-11-23', base({ lessons: [{ id: 'L', classId: 'gone', date: '2026-11-23', title: 'Orphan', status: 'draft' }] }));
    expect(a.otherLessons[0].class).toBeNull();
  });

  it('on today, classes are done, on now, or later; the next one is picked out', () => {
    const at = now => dayAgenda('2026-11-23', base(), { today: '2026-11-23', now });
    expect(at('07:00').schedule.map(x => x.when)).toEqual(['later', 'later']);
    expect(at('07:00').next.class.name).toBe('Art');
    const mid = at('08:10');
    expect(mid.current.class.name).toBe('Art');
    expect(mid.next.class.name).toBe('Biology');
    expect(at('08:50').schedule.map(x => x.when)).toEqual(['done', 'later']); // ends at 8:50
    const after = at('11:00');
    expect([after.current, after.next]).toEqual([null, null]);
    // Another day has no now/next.
    expect(dayAgenda('2026-11-30', base(), { today: '2026-11-23', now: '08:10' }).schedule.map(x => x.when)).toEqual([null, null]);
  });
});

describe('what needs attention', () => {
  const tasks = [
    task('old', '2026-11-20'), task('older', '2026-11-02'), task('done late', '2026-11-20', { done: true }),
    task('low today', '2026-11-23', { priority: 'low' }), task('high today', '2026-11-23', { priority: 'high' }),
    task('tomorrow', '2026-11-24'), task('no date', null),
  ];

  it('tasks: due on the day, by priority; overdue only when the day is today; done ones never', () => {
    const a = dayAgenda('2026-11-23', base({ tasks }), { today: '2026-11-23' });
    expect(a.tasksDue.map(t => t.title)).toEqual(['high today', 'low today']);
    expect(a.overdue.map(t => t.title)).toEqual(['older', 'old']);
    const other = dayAgenda('2026-11-24', base({ tasks }), { today: '2026-11-23' });
    expect(other.tasksDue.map(t => t.title)).toEqual(['tomorrow']);
    expect(other.overdue).toEqual([]);
  });

  it('grading: only assignments marked To grade, soonest deadline first, late ones flagged', () => {
    const assignments = [
      asg('a1', { status: 'to-grade', gradeBy: '2026-11-25' }), asg('a2', { status: 'to-grade', gradeBy: '2026-11-20' }),
      asg('a3', { status: 'to-grade' }), asg('a4', { status: 'assigned', due: '2026-11-01' }), asg('a5', { status: 'graded', gradeBy: '2026-11-01' }),
    ];
    const a = dayAgenda('2026-11-23', base({ assignments }), { today: '2026-11-23' });
    expect(a.toGrade.map(x => [x.assignment.id, x.late])).toEqual([['a2', true], ['a1', false], ['a3', false]]);
    expect(a.toGrade[0].class).toBe(bio);
  });

  it('nothing is counted when there’s nothing', () => {
    const a = dayAgenda('2026-11-23', base(), { today: '2026-11-23' });
    expect([a.tasksDue, a.overdue, a.toGrade, a.upcoming, a.otherLessons]).toEqual([[], [], [], [], []]);
    expect(a.draftLessons).toBe(0);
  });
});

describe('coming up', () => {
  it('the 7 days after the shown day: due dates, grading deadlines, tasks and days off', () => {
    const data = base({
      assignments: [asg('Essay', { due: '2026-11-25' }), asg('Quiz', { status: 'to-grade', gradeBy: '2026-11-30' }), asg('Graded', { status: 'graded', due: '2026-11-24' }), asg('Far', { due: '2026-12-01' })],
      tasks: [task('Copies', '2026-11-24'), task('Today', '2026-11-23'), task('Done', '2026-11-24', { done: true })],
      daysOff: [{ id: 'd', title: 'Thanksgiving', start: '2026-11-26', end: '2026-11-27', kind: 'holiday' }],
    });
    const a = dayAgenda('2026-11-23', data, { today: '2026-11-23' });
    expect(a.upcoming.map(u => `${u.date} ${u.kind} ${u.title}`)).toEqual([
      '2026-11-24 task Copies', '2026-11-25 due Essay', '2026-11-26 off Thanksgiving', '2026-11-30 grade Quiz',
    ]);
    // The window moves with the shown day, across the month.
    expect(dayAgenda('2026-11-24', data).upcoming.map(u => u.title)).toEqual(['Essay', 'Thanksgiving', 'Quiz', 'Far']);
  });
});

describe('dates', () => {
  it('finds the next day with a class, across month and year ends', () => {
    const fri = { ...bio, meetings: [{ id: 'f', day: 5, start: '09:00', end: '10:00' }] };
    expect(nextClassDay('2026-10-30', base({ classes: [bio] })).date).toBe('2026-11-02');      // Fri → Mon, new month
    expect(nextClassDay('2026-12-31', base({ classes: [fri] })).date).toBe('2027-01-01');      // a Friday, new year
    const winter = [{ id: 'w', title: 'Winter break', start: '2026-12-21', end: '2027-01-01', kind: 'break' }];
    expect(nextClassDay('2026-12-18', base({ classes: [bio], daysOff: winter })).date).toBe('2027-01-04');
    expect(nextClassDay('2026-12-18', base({ classes: [{ ...bio, meetings: [] }] }))).toBeNull();
  });

  it('names days relative to today, also across daylight saving changes', () => {
    expect(relativeDay('2026-11-23', '2026-11-23')).toBe('Today');
    expect(relativeDay('2026-11-24', '2026-11-23')).toBe('Tomorrow');
    expect(relativeDay('2026-11-22', '2026-11-23')).toBe('Yesterday');
    expect(relativeDay('2027-01-01', '2026-12-29')).toBe('In 3 days');
    expect(relativeDay('2026-03-01', '2026-03-10')).toBe('9 days ago');   // across the US spring change
    expect(relativeDay('2026-11-05', '2026-10-29')).toBe('In 7 days');    // across the fall change
  });

  describe('time zones', () => {
    const tz = process.env.TZ;
    afterEach(() => { process.env.TZ = tz; });
    it('"today" is the teacher’s own calendar day, not the UTC one', () => {
      const moment = new Date(Date.UTC(2026, 10, 24, 3, 30)); // 3:30 UTC on Nov 24
      process.env.TZ = 'America/Los_Angeles';
      expect(iso(moment)).toBe('2026-11-23');                 // still the evening of the 23rd in California
      process.env.TZ = 'Pacific/Auckland';
      expect(iso(moment)).toBe('2026-11-24');
      process.env.TZ = 'America/Los_Angeles';
      expect(dayAgenda(iso(moment), base(), { today: iso(moment), now: '19:30' }).schedule.map(x => x.when)).toEqual(['done', 'done']);
    });
  });
});

describe('integrity', () => {
  it('reading the agenda never changes or saves data', () => {
    const { store, storage } = testStore();
    const c = store.create('classes', sampleClass()).record;
    store.create('lessons', { classId: c.id, title: 'Cells', date: '2026-10-26' });
    store.create('tasks', { title: 'Copies', due: '2026-10-20' });
    const before = new Map(storage.map);
    const data = { ...Object.fromEntries(['classes', 'daysOff', 'lessons', 'assignments', 'tasks'].map(k => [k, store.all(k)])), settings: store.settings() };
    const a = dayAgenda('2026-10-26', data, { today: '2026-10-27', now: '09:00' });
    expect(a.schedule).toHaveLength(1);
    expect(a.overdue).toEqual([]); // the shown day isn't today
    expect(storage.map).toEqual(before);
  });
});
