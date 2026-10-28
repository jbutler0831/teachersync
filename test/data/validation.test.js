import { describe, it, expect } from 'vitest';
import { text, date, time, int, oneOf, bool, list, cleanFields, isIsoDate, makeId, ID_RE } from '../../src/data/fields.js';
import { cleanRecord, cleanSettings, defaultSettings, TYPES } from '../../src/data/schema.js';

describe('field rules', () => {
  it('text: trims, collapses spaces, strips control characters, limits length', () => {
    const t = text(10);
    expect(t('  Bio\n  101 ').value).toBe('Bio 101');
    expect(t('a\u0000b\u0007c').value).toBe('abc');
    expect(t(42).value).toBe('42');
    expect(t({}).error).toBe('Must be text');
    const long = t('abcdefghijklmno');
    expect(long.value).toBe('abcdefghij');
    expect(long.error).toMatch(/10 characters/);
    expect(text(10, { req: true })('   ').error).toBe('Required');
  });

  it('multiline text keeps line breaks and normalizes Windows ones', () => {
    expect(text(100, { multiline: true })(' line 1  \r\n\r\n  line 2 ').value).toBe('line 1\n\n  line 2');
  });

  it('dates must be real calendar days', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('26-02-01')).toBe(false);
    expect(isIsoDate('3026-01-01')).toBe(false);
    expect(date()('')).toEqual({ value: null });
    expect(date()('next tuesday').error).toBe('Not a valid date');
    expect(date({ req: true })(null).error).toBe('Required');
  });

  it('times are 24-hour HH:MM', () => {
    expect(time()('8:05').value).toBe('08:05');
    expect(time()('23:59').value).toBe('23:59');
    expect(time()('24:00').error).toBeTruthy();
    expect(time()('8am').error).toBeTruthy();
  });

  it('numbers, choices and yes/no fall back to defaults', () => {
    expect(int(0, 60, 3)('7').value).toBe(7);
    expect(int(0, 60, 3)('7.5')).toMatchObject({ value: 3, error: expect.any(String) });
    expect(int(0, 60, 3)(99).error).toBeTruthy();
    expect(int(0, 6)(undefined).error).toBe('Required');
    expect(oneOf(['a', 'b'], 'a')('c')).toEqual({ value: 'a', error: 'Not a valid choice' });
    expect(bool(false)('yes').value).toBe(false);
  });

  it('cleanFields drops unknown properties, including __proto__', () => {
    const raw = JSON.parse('{"name":"x","__proto__":{"polluted":true},"extra":1}');
    const r = cleanFields({ name: text(10) }, raw);
    expect(r.value).toEqual({ name: 'x' });
    expect({}.polluted).toBeUndefined();
    expect(Object.keys(r.value)).toEqual(['name']);
  });

  it('lists skip unusable items and report them', () => {
    const r = list({ day: int(0, 6), start: time({ req: true }) }, 2, { label: 'meeting' })([{ day: 1, start: '8:00' }, { day: 9, start: '9:00' }, 'junk']);
    expect(r.value).toEqual([{ day: 1, start: '08:00' }]);
    expect(r.error).toMatch(/meeting/);
  });

  it('makes random ids that pass the id check', () => {
    const ids = new Set(Array.from({ length: 200 }, makeId));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(ID_RE);
  });
});

describe('records', () => {
  it('a valid class is kept with an id and timestamps', () => {
    const { record, errors } = cleanRecord('classes', { name: 'Algebra', meetings: [{ day: 2, start: '10:00', end: '10:50' }] }, { strict: true, now: 5 });
    expect(errors).toEqual({});
    expect(record).toMatchObject({ name: 'Algebra', subject: '', room: '', color: 's1', createdAt: 5, updatedAt: 5 });
    expect(record.id).toMatch(ID_RE);
    expect(record.meetings[0].id).toMatch(ID_RE);
  });

  it('strict mode reports every problem by field', () => {
    const { record, errors } = cleanRecord('assignments', { classId: 'c1', title: '', assigned: '2026-10-10', due: '2026-10-01', gradeBy: '2026-09-01' }, { strict: true });
    expect(record).toBeNull();
    expect(errors).toMatchObject({ title: 'Required', due: expect.stringMatching(/before the assigned/), gradeBy: expect.stringMatching(/before the due/) });
  });

  it('strict mode rejects a meeting that ends before it starts', () => {
    const { record, errors } = cleanRecord('classes', { name: 'Art', meetings: [{ day: 1, start: '10:00', end: '09:00' }] }, { strict: true });
    expect(record).toBeNull();
    expect(errors.meetings).toMatch(/end time/);
  });

  it('loading is forgiving: fixes what it can, keeps the rest', () => {
    const { record } = cleanRecord('lessons', { id: 'L1', classId: 'c1', date: '2026-10-27', title: 'Cells', status: 'weird', objectives: 7, createdAt: 'x' }, { now: 9 });
    expect(record).toMatchObject({ id: 'L1', status: 'draft', objectives: '7', createdAt: 9, updatedAt: 9 });
  });

  it('loading drops records missing something required', () => {
    expect(cleanRecord('lessons', { classId: 'c1', title: 'No date' }).record).toBeNull();
    expect(cleanRecord('tasks', { title: '' }).record).toBeNull();
    expect(cleanRecord('tasks', 'not an object').record).toBeNull();
    expect(cleanRecord('tasks', null).record).toBeNull();
  });

  it('days off: a missing or earlier last day becomes the first day', () => {
    expect(cleanRecord('daysOff', { title: 'Holiday', start: '2026-11-26' }).record.end).toBe('2026-11-26');
    expect(cleanRecord('daysOff', { title: 'Break', start: '2026-12-21', end: '2026-12-01' }).record.end).toBe('2026-12-21');
  });

  it('classes: optional notes keep their line breaks; older classes without notes still load', () => {
    expect(cleanRecord('classes', { name: 'Bio', notes: 'Line 1\nLine 2' }, { strict: true }).record.notes).toBe('Line 1\nLine 2');
    expect(cleanRecord('classes', { id: 'c1', name: 'Bio', meetings: [] }).record.notes).toBe('');
  });

  it('classes: overlapping meeting times are refused when saving, but kept when loading', () => {
    const raw = { name: 'Bio', meetings: [{ day: 1, start: '08:00', end: '09:00' }, { day: 1, start: '08:30', end: '09:30' }] };
    expect(cleanRecord('classes', raw, { strict: true }).errors.meetings).toBe('Two meeting times overlap on Monday');
    expect(cleanRecord('classes', raw).record.meetings).toHaveLength(2);
  });

  it('days off: at most a year long', () => {
    expect(cleanRecord('daysOff', { title: 'Year', start: '2026-08-01', end: '2027-08-01' }, { strict: true }).record).toBeTruthy();
    expect(cleanRecord('daysOff', { title: 'Typo', start: '2026-12-21', end: '2062-01-01' }, { strict: true }).errors.end).toMatch(/up to a year/);
  });

    it('tasks that aren’t done have no done time', () => {
    expect(cleanRecord('tasks', { title: 'Copies', done: false, doneAt: 123 }).record.doneAt).toBeNull();
  });

  it('cleaning twice changes nothing (so backups round-trip exactly)', () => {
    for (const [type, raw] of [
      ['classes', { name: '  Bio  ', meetings: [{ day: 1, start: '8:00', end: '9:00' }] }],
      ['lessons', { classId: 'c', date: '2026-01-05', title: 'T', notes: 'a  \r\nb ' }],
      ['tasks', { title: 'x', done: true, doneAt: 4 }],
    ]) {
      const once = cleanRecord(type, raw, { now: 1 }).record;
      expect(cleanRecord(type, once, { now: 2 }).record).toEqual(once);
    }
  });

  it('no record type has fields for student information', () => {
    const all = Object.values(TYPES).flatMap(t => Object.keys(t.fields)).join(' ');
    expect(all).not.toMatch(/student|grade(?!By)|score|email|phone|birth|parent/i);
  });
});

describe('settings', () => {
  it('defaults', () => {
    expect(defaultSettings()).toEqual({ theme: 'system', weekStartsOn: 1, gradingDays: 3, schedule: { kind: 'weekly' }, lastExportAt: null });
  });

  it('damaged values fall back to defaults when loading, and are refused when saving', () => {
    const raw = { theme: 'neon', gradingDays: -4, weekStartsOn: 0, schedule: { kind: 'lunar' }, bogus: 1 };
    expect(cleanSettings(raw).settings).toEqual({ theme: 'system', weekStartsOn: 0, gradingDays: 3, schedule: { kind: 'weekly' }, lastExportAt: null });
    const strict = cleanSettings(raw, { strict: true });
    expect(strict.settings).toBeNull();
    expect(Object.keys(strict.errors).sort()).toEqual(['gradingDays', 'schedule', 'theme']);
  });
});
