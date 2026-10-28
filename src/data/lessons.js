// Finding and organizing lesson plans: search, filters, date groups, and the dates a class meets next.
// Works on the store's records; nothing here saves anything.
import { meetingsOn } from './schedule.js';
import { addDays, fromIso, iso } from '../lib/dates.js';

export const WHEN = [['upcoming', 'Upcoming'], ['past', 'Past'], ['undated', 'No date'], ['all', 'All dates'], ['day', 'On a date']];
const TEXT_FIELDS = ['title', 'objectives', 'activities', 'materials', 'assessment', 'notes'];

// Lowercase without accents, so "resume" finds "Résumé".
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** True when every word of the query appears somewhere in the plan (its text fields or its class's name). */
export function matches(lesson, query, className = '') {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold([...TEXT_FIELDS.map(f => lesson[f]), className].join('\n'));
  return words.every(w => hay.includes(w));
}

/**
 * Filters lesson plans. `filters`: { query, classId ('' for all, 'missing' for plans whose class is gone),
 * status ('' for all), when (see WHEN), day ('YYYY-MM-DD' for when = 'day') }. `today` is 'YYYY-MM-DD'.
 * Upcoming means today or later, plus plans with no date yet (they're still being prepared).
 */
export function filterLessons(lessons, classes, filters, today) {
  const { query = '', classId = '', status = '', when = 'upcoming', day = '' } = filters;
  const names = new Map(classes.map(c => [c.id, c.name]));
  return lessons.filter(l => {
    if (classId === 'missing' ? names.has(l.classId) : classId && l.classId !== classId) return false;
    if (status && l.status !== status) return false;
    if (when === 'upcoming' && l.date && l.date < today) return false;
    if (when === 'past' && !(l.date && l.date < today)) return false;
    if (when === 'undated' && l.date) return false;
    if (when === 'day' && day && l.date !== day) return false;
    return matches(l, query, names.get(l.classId));
  });
}

/**
 * Groups plans by date for the list: [{ date, lessons }], with a final { date: null } group for plans with no date.
 * Past and all-dates lists put the most recent first; upcoming lists the soonest first.
 * Within a day: by when the class meets, then by class name and title.
 */
export function groupByDate(lessons, classes, when) {
  const byId = new Map(classes.map(c => [c.id, c]));
  const startOf = (l) => {
    const c = byId.get(l.classId);
    if (!c || !l.date) return '99:99';
    const wd = fromIso(l.date).getDay();
    return c.meetings.filter(m => m.day === wd).map(m => m.start).sort()[0] || '99:99';
  };
  const within = (a, b) => startOf(a).localeCompare(startOf(b)) || (byId.get(a.classId)?.name || '~').localeCompare(byId.get(b.classId)?.name || '~') || a.title.localeCompare(b.title);
  const groups = new Map();
  for (const l of lessons) {
    const k = l.date || '';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(l);
  }
  const newestFirst = when === 'past' || when === 'all';
  const dated = [...groups.keys()].filter(Boolean).sort((a, b) => (newestFirst ? b.localeCompare(a) : a.localeCompare(b)));
  const out = dated.map(date => ({ date, lessons: groups.get(date).sort(within) }));
  if (groups.has('')) out.push({ date: null, lessons: groups.get('').sort((a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title)) });
  return out;
}

/** The next `count` dates (from `from`, inclusive) when this class meets, skipping days off. */
export function nextMeetingDates(classId, data, from, count = 3, limit = 60) {
  const out = [];
  for (let i = 0; i < limit && out.length < count; i++) {
    const d = iso(addDays(fromIso(from), i));
    if (meetingsOn(d, data).some(x => x.class.id === classId)) out.push(d);
  }
  return out;
}

/** The fields of a plan to start a copy from: everything the teacher wrote, as a new Draft with no date. */
export function copyOf(lesson) {
  const { classId, title, objectives, activities, materials, assessment, notes } = lesson;
  return { classId, title, objectives, activities, materials, assessment, notes, date: null, status: 'draft' };
}
