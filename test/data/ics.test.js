import { describe, it, expect, afterEach } from 'vitest';
import { escapeText, fold, utcStamp, calendarEvents, toICS, icsFileName, ICS_TYPE, KINDS } from '../../src/data/ics.js';
import { defaultSettings } from '../../src/data/schema.js';
import { testStore, sampleClass } from './memory.js';

const bio = { id: 'bio', name: 'Biology, period 2', color: 's1', room: '204', subject: 'Science', meetings: [{ id: 'm1', day: 1, start: '10:00', end: '10:50' }, { id: 'm3', day: 3, start: '10:00', end: '10:50' }] };
const data = (over = {}) => ({ classes: [bio], daysOff: [], lessons: [], assignments: [], tasks: [], settings: defaultSettings(), ...over });
const bytes = s => new TextEncoder().encode(s).length;
const unfold = text => text.replace(/\r\n /g, '');

describe('text and lines', () => {
  it('escapes backslash, semicolon, comma and line breaks', () => {
    expect(escapeText('a\\b;c,d\ne\r\nf')).toBe('a\\\\b\;c\\,d\\ne\\nf');
  });
  it('folds lines at 75 octets, never inside a character, and unfolds back exactly', () => {
    const line = 'SUMMARY:' + 'x'.repeat(200);
    const f = fold(line);
    expect(f.split('\r\n').every(l => bytes(l) <= 75)).toBe(true);
    expect(f.split('\r\n').slice(1).every(l => l.startsWith(' '))).toBe(true);
    expect(unfold(f)).toBe(line);
    const wide = 'SUMMARY:' + 'é😀'.repeat(40);
    expect(fold(wide).split('\r\n').every(l => bytes(l) <= 75)).toBe(true);
    expect(unfold(fold(wide))).toBe(wide);
    expect(fold('SHORT:line')).toBe('SHORT:line');
  });
});

describe('time zones', () => {
  const tz = process.env.TZ;
  afterEach(() => { process.env.TZ = tz; });
  it('class times become the right UTC instant on each side of a daylight-saving change', () => {
    process.env.TZ = 'America/New_York';
    expect(utcStamp('2026-03-06', '08:00')).toBe('20260306T130000Z'); // EST
    expect(utcStamp('2026-03-09', '08:00')).toBe('20260309T120000Z'); // EDT
    expect(utcStamp('2026-11-02', '08:00')).toBe('20261102T130000Z'); // EST again
    process.env.TZ = 'Europe/Berlin';
    expect(utcStamp('2026-07-01', '08:00')).toBe('20260701T060000Z');
    process.env.TZ = 'Australia/Sydney';                              // a date that’s the day before in UTC
    expect(utcStamp('2026-11-23', '08:00')).toBe('20261122T210000Z');
  });
});

describe('events', () => {
  const tz = process.env.TZ;
  afterEach(() => { process.env.TZ = tz; });
  const full = () => data({
    daysOff: [{ id: 'off1', title: 'Thanksgiving break', start: '2026-11-25', end: '2026-11-27' }, { id: 'old', title: 'Old', start: '2026-10-01', end: '2026-10-01' }],
    lessons: [{ id: 'L1', classId: 'bio', date: '2026-11-23', title: 'Cells; mitosis, meiosis', status: 'ready', notes: 'PRIVATE NOTE' }, { id: 'L2', classId: 'bio', date: null, title: 'Undated', status: 'draft' }],
    assignments: [
      { id: 'A1', classId: 'bio', title: 'Lab report', due: '2026-11-24', gradeBy: '2026-11-27', status: 'assigned', description: 'SECRET INSTRUCTIONS' },
      { id: 'A2', classId: 'bio', title: 'Graded quiz', due: '2026-11-23', gradeBy: '2026-11-26', status: 'graded' },
      { id: 'A3', classId: 'bio', title: 'No dates', due: null, gradeBy: null, status: 'assigned' },
    ],
    tasks: [{ id: 'T1', title: 'Copies', due: '2026-11-24', priority: 'high', done: false, classId: null }, { id: 'T2', title: 'Done', due: '2026-11-24', priority: 'normal', done: true }, { id: 'T3', title: 'No date', due: null, done: false, priority: 'normal' }],
  });
  const range = { from: '2026-11-23', to: '2026-11-29' };

  it('one event per class meeting (none on days off), and dated records only; nothing invented', () => {
    const ev = calendarEvents(full(), range);
    expect(ev).toHaveLength(7);
    const kinds = ev.map(e => e.kind);
    expect(kinds.filter(k => k === 'class')).toHaveLength(1);                                // Mon only; Wed is a day off
    expect(ev.find(e => e.kind === 'class')).toMatchObject({ summary: 'Biology, period 2', location: 'Room 204', allDay: false });
    expect(ev.filter(e => e.kind === 'lesson').map(e => e.summary)).toEqual(['Lesson plan: Cells; mitosis, meiosis']);
    expect(ev.filter(e => e.kind === 'due').map(e => e.summary)).toEqual(['Due: Graded quiz', 'Due: Lab report']);
    expect(ev.filter(e => e.kind === 'grade').map(e => e.summary)).toEqual(['Grade by: Lab report']); // not the graded quiz
    expect(ev.filter(e => e.kind === 'task').map(e => e.summary)).toEqual(['Task: Copies']);           // not done, dated
    expect(ev.find(e => e.kind === 'off')).toMatchObject({ start: '2026-11-25', end: '2026-11-28', allDay: true }); // end is exclusive
    expect(ev.some(e => /Undated|No date|Old/.test(e.summary))).toBe(false);
  });

  it('in date order, timed classes after that day’s all-day items', () => {
    const ev = calendarEvents(full(), range);
    const first = ev.filter(e => (e.allDay ? e.start : '2026-11-23') === '2026-11-23' || e.start.startsWith('20261123'));
    expect(first.map(e => e.kind)).toEqual(['due', 'lesson', 'class']);
  });

  it('only the chosen kinds', () => {
    expect(new Set(calendarEvents(full(), { ...range, kinds: ['task', 'off'] }).map(e => e.kind))).toEqual(new Set(['task', 'off']));
    expect(calendarEvents(full(), { ...range, kinds: [] })).toEqual([]);
  });

  it('stable, unique ids', () => {
    const a = calendarEvents(full(), range).map(e => e.uid), b = calendarEvents(full(), range).map(e => e.uid);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
    expect(a).toContain('class-bio-m1-20261123@teachersync.app');
    expect(a).toContain('due-A1@teachersync.app');
    expect(a).toContain('grade-A1@teachersync.app');
  });

  it('a valid calendar file: structure, dates vs times, escaping, no private fields', () => {
    process.env.TZ = 'America/New_York';
    const text = toICS(calendarEvents(full(), range), { now: new Date(Date.UTC(2026, 10, 20, 15, 4, 5)) });
    expect(text.endsWith('\r\n')).toBe(true);
    expect(text.split('\r\n').filter(Boolean).every(l => bytes(l) <= 75)).toBe(true);
    expect(/(^|[^\r])\n/.test(text)).toBe(false);                                           // only CRLF
    const lines = unfold(text).split('\r\n');
    expect(lines.slice(0, 3)).toEqual(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TeacherSync//TeacherSync//EN']);
    expect(lines.at(-2)).toBe('END:VCALENDAR');
    expect(lines.filter(l => l === 'BEGIN:VEVENT').length).toBe(lines.filter(l => l === 'END:VEVENT').length);
    expect(lines).toContain('DTSTAMP:20261120T150405Z');
    expect(lines).toContain('DTSTART:20261123T150000Z');                                     // 10:00 EST
    expect(lines).toContain('DTEND:20261123T155000Z');
    expect(lines).toContain('DTSTART;VALUE=DATE:20261125');
    expect(lines).toContain('DTEND;VALUE=DATE:20261128');
    expect(lines).toContain('SUMMARY:Lesson plan: Cells\; mitosis\\, meiosis');
    expect(lines).toContain('SUMMARY:Biology\\, period 2');
    expect(lines).toContain('CATEGORIES:Grading deadlines');
    expect(text).not.toMatch(/PRIVATE NOTE|SECRET INSTRUCTIONS|createdAt|updatedAt/);
    for (const block of unfold(text).split('BEGIN:VEVENT').slice(1)) {
      for (const p of ['UID:', 'DTSTAMP:', 'DTSTART', 'DTEND', 'SUMMARY:']) expect(block).toContain(p);
    }
  });

  it('an empty export still makes a valid (empty) calendar; names and type', () => {
    expect(toICS([])).toMatch(/^BEGIN:VCALENDAR\r\n[\s\S]*END:VCALENDAR\r\n$/);
    expect(icsFileName('2026-11-23', '2026-11-29')).toBe('TeacherSync-2026-11-23-to-2026-11-29.ics');
    expect(ICS_TYPE).toBe('text/calendar;charset=utf-8');
    expect(KINDS.map(k => k[0])).toEqual(['class', 'lesson', 'due', 'grade', 'task', 'off']);
  });

  it('generating an export never changes or saves anything', () => {
    const { store, storage } = testStore();
    const c = store.create('classes', sampleClass()).record;
    store.create('lessons', { classId: c.id, title: 'Cells', date: '2026-10-26' });
    const before = new Map(storage.map);
    const recs = JSON.stringify(store.exportData());
    const d = { classes: store.all('classes'), daysOff: store.all('daysOff'), lessons: store.all('lessons'), assignments: [], tasks: [], settings: store.settings() };
    toICS(calendarEvents(d, { from: '2026-10-26', to: '2026-11-22' }));
    expect(storage.map).toEqual(before);
    expect(JSON.stringify(store.exportData())).toBe(recs);
  });
});
