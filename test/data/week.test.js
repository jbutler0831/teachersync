import { describe, it, expect } from 'vitest';
import { weekDays, dayItems, shiftWeek, weeksFrom, weekLabel, undated } from '../../src/data/week.js';
import { defaultSettings } from '../../src/data/schema.js';
import { testStore, sampleClass } from './memory.js';

const today = '2026-11-23'; // a Monday
const bio = { id: 'bio', name: 'Biology', color: 's1', room: '204', meetings: [{ id: 'm1', day: 1, start: '10:00', end: '10:50' }, { id: 'm3', day: 3, start: '10:00', end: '10:50' }] };
const art = { id: 'art', name: 'Art', color: 's2', room: '', meetings: [{ id: 'm2', day: 1, start: '08:00', end: '08:50' }] };
const data = (over = {}, settings = {}) => ({ classes: [bio, art], daysOff: [], lessons: [], assignments: [], tasks: [], settings: { ...defaultSettings(), ...settings }, ...over });
const dates = (d, s) => weekDays(d, data({}, s), today).map(x => x.date);

describe('weeks', () => {
  it('start on Monday or Sunday, from the setting', () => {
    expect(dates('2026-11-25')).toEqual(['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']);
    expect(dates('2026-11-25', { weekStartsOn: 0 })[0]).toBe('2026-11-22');
    expect(dates('2026-11-22', { weekStartsOn: 1 })[0]).toBe('2026-11-16'); // a Sunday ends the Monday week
  });
  it('cross months, years, leap days and daylight-saving changes as seven calendar days', () => {
    expect(dates('2026-12-31')).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
    expect(dates('2028-02-29')).toEqual(['2028-02-28', '2028-02-29', '2028-03-01', '2028-03-02', '2028-03-03', '2028-03-04', '2028-03-05']);
    expect(dates('2026-03-08', { weekStartsOn: 0 })).toEqual(['2026-03-08', '2026-03-09', '2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13', '2026-03-14']);
    expect(dates('2026-11-01', { weekStartsOn: 0 })[6]).toBe('2026-11-07');
  });
  it('previous, next, and how far from this week', () => {
    expect(shiftWeek('2026-11-25', 1, 1)).toBe('2026-11-30');
    expect(shiftWeek('2026-11-25', 1, -1)).toBe('2026-11-16');
    expect(shiftWeek('2026-12-30', 1, 1)).toBe('2027-01-04');
    expect([0, 1, -1, 3, -2].map(weekLabel)).toEqual(['This week', 'Next week', 'Last week', 'In 3 weeks', '2 weeks ago']);
    expect(weeksFrom('2026-11-30', today, 1)).toBe(1);
    expect(weeksFrom('2026-03-09', '2026-03-02', 1)).toBe(1);   // across the spring change
    expect(weeksFrom('2026-10-26', '2026-11-23', 1)).toBe(-4);  // across the fall change
  });
});

describe('a day', () => {
  it('class meetings in time order, each with its lesson plans', () => {
    const lessons = [{ id: 'L1', classId: 'bio', date: today, title: 'Cells', status: 'ready' }];
    const d = dayItems(today, data({ lessons }), today);
    expect(d.classes.map(x => [x.class.name, x.meeting.start, x.lessons.map(l => l.title)])).toEqual([['Art', '08:00', []], ['Biology', '10:00', ['Cells']]]);
    expect(d.allDay).toEqual([]);
    expect(d.count).toBe(2);
  });

  it('a day off: no classes; a plan dated that day still shows, as an all-day item', () => {
    const daysOff = [{ id: 'd', title: 'Break', start: '2026-11-23', end: '2026-11-27' }];
    const lessons = [{ id: 'L1', classId: 'bio', date: today, title: 'Planned anyway', status: 'draft' }];
    const d = dayItems(today, data({ daysOff, lessons }), today);
    expect(d.dayOff.title).toBe('Break');
    expect(d.classes).toEqual([]);
    expect(d.allDay.map(x => [x.kind, x.record.title])).toEqual([['lesson', 'Planned anyway']]);
  });

  it('due dates, grading deadlines (until graded), plans whose class doesn’t meet, and tasks, in that order', () => {
    const d = dayItems('2026-11-24', data({
      lessons: [{ id: 'L', classId: 'bio', date: '2026-11-24', title: 'Tuesday plan', status: 'draft' }, { id: 'U', classId: 'bio', date: null, title: 'Undated', status: 'draft' }],
      assignments: [
        { id: 'a1', classId: 'bio', title: 'Essay', due: '2026-11-24', gradeBy: null, status: 'assigned' },
        { id: 'a2', classId: 'art', title: 'Quiz', due: '2026-11-20', gradeBy: '2026-11-24', status: 'to-grade' },
        { id: 'a3', classId: 'art', title: 'Graded one', due: '2026-11-18', gradeBy: '2026-11-24', status: 'graded' },
      ],
      tasks: [
        { id: 't1', title: 'Done task', due: '2026-11-24', priority: 'high', done: true, classId: null },
        { id: 't2', title: 'Low task', due: '2026-11-24', priority: 'low', done: false, classId: null },
        { id: 't3', title: 'High task', due: '2026-11-24', priority: 'high', done: false, classId: 'bio' },
        { id: 't4', title: 'No date', due: null, priority: 'high', done: false, classId: null },
      ],
    }), today);
    expect(d.allDay.map(x => `${x.kind}:${x.record.title}`)).toEqual(['due:Essay', 'grade:Quiz', 'lesson:Tuesday plan', 'task:High task', 'task:Low task', 'task:Done task']);
    expect(d.allDay.find(x => x.kind === 'task' && x.record.id === 't3').class.name).toBe('Biology');
  });

  it('flags use the shared rules, measured from the real today', () => {
    const d = dayItems('2026-11-20', data({
      assignments: [{ id: 'a', classId: 'bio', title: 'Lab', due: '2026-11-20', gradeBy: '2026-11-20', status: 'assigned' }, { id: 'b', classId: 'bio', title: 'Quiz', due: '2026-11-19', gradeBy: '2026-11-20', status: 'to-grade' }],
      tasks: [{ id: 't', title: 'Copies', due: '2026-11-20', priority: 'normal', done: false }],
    }), today);
    expect(d.allDay.map(x => `${x.kind}:${x.record.title}:${x.flag}`)).toEqual(['due:Lab:Past due', 'grade:Lab:', 'grade:Quiz:Late', 'task:Copies:Overdue']);
  });

  it('counts what has no date, without placing it anywhere', () => {
    expect(undated(data({ tasks: [{ due: null, done: false }, { due: null, done: true }, { due: today, done: false }], lessons: [{ date: null }] }))).toEqual({ tasks: 1, lessons: 1 });
  });

  it('reading a week never changes or saves anything', () => {
    const { store, storage } = testStore();
    const c = store.create('classes', sampleClass()).record;
    store.create('tasks', { title: 'x', due: '2026-10-27', classId: c.id });
    const before = new Map(storage.map);
    weekDays('2026-10-27', { classes: store.all('classes'), daysOff: [], lessons: [], assignments: [], tasks: store.all('tasks'), settings: store.settings() }, today);
    expect(storage.map).toEqual(before);
  });
});
