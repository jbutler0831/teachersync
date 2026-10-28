// What TeacherSync stores, and how each kind of record is checked and cleaned.
// No record has a place for student names or other student information.
import { text, date, time, oneOf, int, bool, stamp, ref, list, cleanFields, makeId, isPlainObject, isIsoDate, ID_RE } from './fields.js';
import { addDays, fromIso, iso, DAY, WEEKDAYS } from '../lib/dates.js';
import { findOverlap } from './schedule.js';

/** Bump this when stored data changes shape, and add a step to MIGRATIONS. */
export const SCHEMA_VERSION = 1;

export const COLLECTIONS = ['classes', 'daysOff', 'lessons', 'assignments', 'tasks'];

export const CLASS_COLORS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'];
export const LESSON_STATUS = [['draft', 'Draft'], ['ready', 'Ready'], ['taught', 'Taught']];
export const ASSIGNMENT_STATUS = [['assigned', 'Assigned'], ['to-grade', 'To grade'], ['graded', 'Graded'], ['returned', 'Returned']];
export const TASK_PRIORITY = [['low', 'Low'], ['normal', 'Normal'], ['high', 'High']];
export const DAY_OFF_KINDS = [['holiday', 'Holiday'], ['break', 'Break'], ['other', 'Other']];
export const THEMES = ['system', 'light', 'dark'];
export const MAX_DAY_OFF_DAYS = 366;
// Only 'weekly' exists now. A/B or rotating days will add a kind here plus a cycle-day field on meetings.
export const SCHEDULE_KINDS = ['weekly'];
const keys = pairs => pairs.map(([k]) => k);

const id = () => raw => ({ value: typeof raw === 'string' && ID_RE.test(raw) ? raw : makeId() });

// A class meeting: weekday (0 = Sunday … 6 = Saturday) and start and end times.
const MEETING = { id: id(), day: int(0, 6), start: time({ req: true }), end: time({ req: true }) };
const meetingCheck = m => (m.start && m.end && m.end <= m.start ? 'The end time is before the start time' : null);

/**
 * Each collection's rules. `check` finds problems between fields (used when saving from a form);
 * `repair` fixes the ones that would break the app when loading data that's already saved;
 * `prepare` fills in defaults before checking.
 */
export const TYPES = {
  classes: {
    label: 'class', plural: 'classes', max: 60,
    fields: {
      name: text(80, { req: true }),
      subject: text(60),
      room: text(30),
      color: oneOf(CLASS_COLORS, 's1'),
      meetings: list(MEETING, 40, { check: meetingCheck, label: 'meeting time' }),
      notes: text(2000, { multiline: true }),
    },
    check: r => {
      const clash = findOverlap(r.meetings);
      return clash ? { meetings: `Two meeting times overlap on ${WEEKDAYS[clash[0].day]}` } : {};
    },
  },
  daysOff: {
    label: 'day off', plural: 'days off', max: 400,
    fields: {
      title: text(80, { req: true }),
      start: date({ req: true }),
      end: date(),
      kind: oneOf(keys(DAY_OFF_KINDS), 'holiday'),
    },
    prepare: r => ({ ...r, end: r.end || r.start }),
    check: r => {
      if (!r.end || !r.start) return {};
      if (r.end < r.start) return { end: 'The last day is before the first day' };
      // A mistyped year (2062 for 2026) would otherwise hide every class for decades.
      if (Math.round((fromIso(r.end) - fromIso(r.start)) / DAY) > MAX_DAY_OFF_DAYS) return { end: 'A day off can last up to a year. Check the year of the last day.' };
      return {};
    },
    repair: r => { if (!r.end || r.end < r.start) r.end = r.start; },
  },
  lessons: {
    label: 'lesson plan', plural: 'lesson plans', max: 10000, refs: { classId: 'classes' },
    fields: {
      classId: ref(),
      date: date({ req: true }),
      title: text(120, { req: true }),
      objectives: text(5000, { multiline: true }),
      materials: text(5000, { multiline: true }),
      notes: text(5000, { multiline: true }),
      status: oneOf(keys(LESSON_STATUS), 'draft'),
    },
  },
  assignments: {
    label: 'assignment', plural: 'assignments', max: 5000, refs: { classId: 'classes' },
    fields: {
      classId: ref(),
      title: text(120, { req: true }),
      assigned: date(),
      due: date(),
      gradeBy: date(),
      status: oneOf(keys(ASSIGNMENT_STATUS), 'assigned'),
    },
    // A new assignment's grading deadline defaults to the due date plus the days set in Settings.
    // If the due date moves and the deadline was still that default, it moves with it.
    prepare: (r, prev, ctx) => {
      const auto = due => (isIsoDate(due) ? iso(addDays(fromIso(due), ctx.settings.gradingDays)) : null);
      if (!prev && r.gradeBy === undefined) return { ...r, gradeBy: auto(r.due) };
      if (prev && r.due !== prev.due && prev.gradeBy === auto(prev.due) && r.gradeBy === prev.gradeBy) return { ...r, gradeBy: auto(r.due) };
      return r;
    },
    check: r => {
      const e = {};
      if (r.assigned && r.due && r.due < r.assigned) e.due = 'The due date is before the assigned date';
      if (r.due && r.gradeBy && r.gradeBy < r.due) e.gradeBy = 'The grading deadline is before the due date';
      return e;
    },
  },
  tasks: {
    label: 'task', plural: 'tasks', max: 5000,
    fields: {
      title: text(200, { req: true }),
      description: text(2000, { multiline: true }),
      due: date(),
      priority: oneOf(keys(TASK_PRIORITY), 'normal'),
      done: bool(false),
      doneAt: stamp(),
    },
    prepare: (r, prev, ctx) => {
      if (r.done && !(prev && prev.done)) return { ...r, doneAt: ctx.now };
      if (!r.done) return { ...r, doneAt: null };
      return r;
    },
    repair: r => { if (!r.done) r.doneAt = null; },
  },
};

export const SETTINGS_FIELDS = {
  theme: oneOf(THEMES, 'system'),
  weekStartsOn: int(0, 1, 1),            // 0 Sunday, 1 Monday
  gradingDays: int(0, 60, 3),            // default grading deadline: days after the due date
  schedule: raw => {
    const r = cleanFields({ kind: oneOf(SCHEDULE_KINDS, 'weekly') }, raw);
    return { value: r.value, error: Object.values(r.errors)[0] };
  },
  lastExportAt: stamp(),
};
export const defaultSettings = () => cleanFields(SETTINGS_FIELDS, {}).value;

/**
 * Cleans one record.
 * - Loading saved or imported data (strict: false): fixes what it can and returns null only when a required
 *   field is missing or unusable.
 * - Saving from a form (strict: true): returns null with an error per field when anything is wrong.
 * Ids and timestamps are kept when valid and created when not.
 */
export function cleanRecord(type, raw, { strict = false, now = Date.now() } = {}) {
  const t = TYPES[type];
  const r = cleanFields(t.fields, raw);
  const errors = { ...r.errors, ...(t.check ? t.check(r.value) : {}) };
  if (r.fatal || (strict && Object.keys(errors).length)) return { record: null, errors };
  const src = isPlainObject(raw) ? raw : {};
  const createdAt = stamp()(src.createdAt).value || now;
  const record = { id: id()(src.id).value, ...r.value, createdAt, updatedAt: stamp()(src.updatedAt).value || createdAt };
  if (t.repair) t.repair(record);
  return { record, errors };
}

/** How many records point at a record that isn't there (a lesson plan or assignment whose class is gone). */
export function orphansOf(data) {
  let n = 0;
  for (const [c, t] of Object.entries(TYPES)) {
    for (const [field, target] of Object.entries(t.refs || {})) {
      const ids = new Set((data[target] || []).map(r => r.id));
      n += (data[c] || []).filter(r => !ids.has(r[field])).length;
    }
  }
  return n;
}

export function cleanSettings(raw, { strict = false } = {}) {
  const r = cleanFields(SETTINGS_FIELDS, raw);
  if (strict && Object.keys(r.errors).length) return { settings: null, errors: r.errors };
  return { settings: r.value, errors: r.errors };
}

// Each step upgrades raw data saved by schema N to N + 1, before it's cleaned.
// `data` is { classes, daysOff, lessons, assignments, tasks, settings, legacy }.
const MIGRATIONS = {
  // 0 → 1: version 0.1 (Phase 1) only saved the theme, under its own key.
  0: d => ({ ...d, settings: { theme: d.legacy && d.legacy.theme, ...(isPlainObject(d.settings) ? d.settings : {}) } }),
};

export function upgrade(data, from) {
  let d = data;
  for (let v = from; v < SCHEMA_VERSION; v++) if (MIGRATIONS[v]) d = MIGRATIONS[v](d);
  return d;
}
