import { describe, it, expect } from 'vitest';
import { meetingsOn, dayOffOn, overlap, findOverlap, conflicts, groupMeetings, weekOf } from '../../src/data/schedule.js';
import { defaultSettings } from '../../src/data/schema.js';

const classes = [
  { id: 'a', name: 'Bio', meetings: [{ id: 'm1', day: 2, start: '10:00', end: '10:50' }, { id: 'm2', day: 4, start: '10:00', end: '10:50' }] },
  { id: 'b', name: 'Art', meetings: [{ id: 'm3', day: 2, start: '08:00', end: '08:50' }] },
];
const daysOff = [{ id: 'd', title: 'Break', start: '2026-11-25', end: '2026-11-27' }];
const settings = defaultSettings();

describe('schedule', () => {
  it('lists the classes meeting on a weekday, earliest first', () => {
    // 2026-10-27 is a Tuesday.
    expect(meetingsOn('2026-10-27', { classes, daysOff, settings }).map(x => `${x.class.name} ${x.meeting.start}`)).toEqual(['Art 08:00', 'Bio 10:00']);
    expect(meetingsOn('2026-10-29', { classes, daysOff, settings }).map(x => x.class.name)).toEqual(['Bio']);
    expect(meetingsOn('2026-10-31', { classes, daysOff, settings })).toEqual([]);
  });

  it('nothing meets on a day off, including every day of a break', () => {
    expect(dayOffOn('2026-11-26', daysOff).title).toBe('Break');
    expect(dayOffOn('2026-11-28', daysOff)).toBeNull();
    expect(meetingsOn('2026-11-26', { classes, daysOff, settings })).toEqual([]); // a Thursday
  });

  it('a schedule kind it doesn’t know yet shows nothing rather than the wrong classes', () => {
    expect(meetingsOn('2026-10-27', { classes, daysOff, settings: { ...settings, schedule: { kind: 'rotation' } } })).toEqual([]);
  });
});

describe('overlaps and conflicts', () => {
  const m = (day, start, end, id) => ({ id, day, start, end });

  it('meetings overlap only on the same day when their times cross', () => {
    expect(overlap(m(1, '08:00', '09:00'), m(1, '08:59', '10:00'))).toBe(true);
    expect(overlap(m(1, '08:00', '09:00'), m(1, '07:00', '12:00'))).toBe(true);
    expect(overlap(m(1, '08:00', '09:00'), m(1, '09:00', '10:00'))).toBe(false); // back to back
    expect(overlap(m(1, '08:00', '09:00'), m(2, '08:00', '09:00'))).toBe(false);
  });

  it('finds the first overlapping pair in a class', () => {
    expect(findOverlap([m(1, '08:00', '09:00'), m(2, '08:00', '09:00'), m(2, '08:30', '09:30')])).toEqual([m(2, '08:00', '09:00'), m(2, '08:30', '09:30')]);
    expect(findOverlap([m(1, '08:00', '09:00'), m(1, '09:00', '10:00')])).toBeNull();
  });

  it('lists other classes’ meetings that overlap, ignoring the class being edited', () => {
    const mine = [m(2, '09:30', '10:30')];
    expect(conflicts(mine, classes, 'none').map(x => x.class.name)).toEqual(['Bio']);
    expect(conflicts(mine, classes, 'a')).toEqual([]);
    expect(conflicts([m(2, '08:49', '10:00')], classes, 'x').map(x => x.class.name)).toEqual(['Art']); // back to back with Bio
  });

  it('groups meetings that share times, in week order', () => {
    const ms = [m(5, '08:00', '08:50'), m(1, '08:00', '08:50'), m(0, '08:00', '08:50'), m(2, '10:00', '11:00')];
    expect(groupMeetings(ms, 1)).toEqual([{ days: [1, 5, 0], start: '08:00', end: '08:50' }, { days: [2], start: '10:00', end: '11:00' }]);
    expect(groupMeetings(ms, 0)[0].days).toEqual([0, 1, 5]);
  });

  it('a week’s dates start on Monday or Sunday', () => {
    expect(weekOf('2026-10-28', 1)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
    expect(weekOf('2026-11-01', 1)[0]).toBe('2026-10-26');   // a Sunday belongs to the week before
    expect(weekOf('2026-11-01', 0)[0]).toBe('2026-11-01');
    expect(weekOf('2026-03-10', 1)).toHaveLength(7);           // across the daylight saving change
    expect(weekOf('2026-03-10', 1)[6]).toBe('2026-03-15');
  });
});
