// What one day holds, for Today: the classes that meet (with that day's lesson plans), what needs attention,
// and what's coming up. Built from the store's data with schedule.js's rules, so Today never keeps its own copy.
// Only explicit statuses count: assignments follow assignments.js (past due, To grade, late), a task is open until
// it's marked done. Each assignment appears in at most one of dueOn, pastDue and toGrade.
import { meetingsOn, dayOffOn } from './schedule.js';
import { isLate, isPastDue } from './assignments.js';
import { addDays, fromIso, iso } from '../lib/dates.js';

export const UPCOMING_DAYS = 7;
const PRIORITY = { high: 0, normal: 1, low: 2 };
const byPriority = (a, b) => PRIORITY[a.priority] - PRIORITY[b.priority] || a.title.localeCompare(b.title);
const after = (date, n) => iso(addDays(fromIso(date), n));

/**
 * @param date   the day shown, 'YYYY-MM-DD'
 * @param data   { classes, daysOff, lessons, assignments, tasks, settings } from the store
 * @param today  the real date, 'YYYY-MM-DD'; overdue and late are measured from it
 * @param now    the time of day, 'HH:MM'; marks classes as done, now or later (only when date is today)
 */
export function dayAgenda(date, data, { today = date, now = null } = {}) {
  const { classes, daysOff, lessons, assignments, tasks } = data;
  const classById = new Map(classes.map(c => [c.id, c]));
  const isToday = date === today;

  // Classes, each with its lesson plans for this date.
  const dayLessons = lessons.filter(l => l.date === date);
  const schedule = meetingsOn(date, data).map(x => ({
    ...x,
    lessons: dayLessons.filter(l => l.classId === x.class.id),
    when: isToday && now ? (now >= x.meeting.end ? 'done' : now >= x.meeting.start ? 'now' : 'later') : null,
  }));
  const placed = new Set(schedule.flatMap(s => s.lessons.map(l => l.id)));
  // Lesson plans for this date whose class doesn't meet (a day off, a different day, or a missing class).
  const otherLessons = dayLessons.filter(l => !placed.has(l.id)).map(lesson => ({ lesson, class: classById.get(lesson.classId) || null }));

  const open = tasks.filter(t => !t.done && t.due);
  const withClass = assignment => ({ assignment, class: classById.get(assignment.classId) || null });
  // The grading pile is what's waiting now, whatever day is shown; late is measured from the real today.
  const toGrade = assignments
    .filter(a => a.status === 'to-grade')
    .sort((a, b) => (a.gradeBy || '9999').localeCompare(b.gradeBy || '9999') || a.title.localeCompare(b.title))
    .map(a => ({ ...withClass(a), late: isLate(a, today) }));
  // Due on the shown day and not collected yet (ones already To grade are in toGrade).
  const dueOn = assignments.filter(a => a.status === 'assigned' && a.due === date).sort((a, b) => a.title.localeCompare(b.title)).map(withClass);
  // Past their due date and still Assigned: only on today, like overdue tasks.
  const pastDue = isToday ? assignments.filter(a => isPastDue(a, today)).sort((a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title)).map(withClass) : [];

  // The next UPCOMING_DAYS days after this one.
  const end = after(date, UPCOMING_DAYS);
  const soon = d => d && d > date && d <= end;
  const upcoming = [
    ...assignments.filter(a => a.status === 'assigned' && soon(a.due)).map(a => ({ id: a.id, date: a.due, kind: 'due', title: a.title, class: classById.get(a.classId) || null })),
    ...assignments.filter(a => a.status === 'to-grade' && soon(a.gradeBy)).map(a => ({ id: a.id, date: a.gradeBy, kind: 'grade', title: a.title, class: classById.get(a.classId) || null })),
    ...open.filter(t => soon(t.due)).map(t => ({ id: t.id, date: t.due, kind: 'task', title: t.title, class: null })),
    ...daysOff.filter(d => soon(d.start)).map(d => ({ id: d.id, date: d.start, kind: 'off', title: d.title, class: null })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title));

  return {
    date,
    isToday,
    dayOff: dayOffOn(date, daysOff),
    schedule,
    current: schedule.find(s => s.when === 'now') || null,
    next: schedule.find(s => s.when === 'later') || null,
    otherLessons,
    draftLessons: dayLessons.filter(l => l.status === 'draft').length,
    tasksDue: open.filter(t => t.due === date).sort(byPriority),
    overdue: isToday ? open.filter(t => t.due < today).sort((a, b) => a.due.localeCompare(b.due) || byPriority(a, b)) : [],
    toGrade,
    dueOn,
    pastDue,
    upcoming,
  };
}

/** The first day after `date` (within `limit` days) when a class meets: { date, first: { class, meeting } }, or null. */
export function nextClassDay(date, data, limit = 28) {
  for (let i = 1; i <= limit; i++) {
    const d = after(date, i);
    const m = meetingsOn(d, data);
    if (m.length) return { date: d, first: m[0] };
  }
  return null;
}

/** "Today", "Tomorrow", "Yesterday", "In 3 days", "5 days ago". */
export function relativeDay(date, today) {
  const n = Math.round((fromIso(date) - fromIso(today)) / 86400000);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  return n > 0 ? `In ${n} days` : `${-n} days ago`;
}
