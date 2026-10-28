// One week for the Week view: each day's day off, its all-day items (due dates, grading deadlines, dated tasks,
// lesson plans whose class doesn't meet that day) and its class meetings in time order, each with that day's
// lesson plans. Built from the store's data with the shared rules (schedule.js, assignments.js, tasks.js);
// nothing is copied or saved. Plans and tasks with no date are never put on a day; they're only counted.
import { meetingsOn, dayOffOn, weekOf } from './schedule.js';
import { isPastDue, isLate, DONE } from './assignments.js';
import { isOverdue } from './tasks.js';
import { addDays, fromIso, iso } from '../lib/dates.js';

const PRIORITY = { high: 0, normal: 1, low: 2 };
const KIND_ORDER = { due: 0, grade: 1, lesson: 2, task: 3 };

/** The items on one date. `today` is the real today (for past due, late and overdue). */
export function dayItems(date, data, today) {
  const classById = new Map(data.classes.map(c => [c.id, c]));
  const cls = id => classById.get(id) || null;
  const dayOff = dayOffOn(date, data.daysOff);
  const lessons = data.lessons.filter(l => l.date === date);
  const placed = new Set();
  const classes = meetingsOn(date, data).map(x => {
    const mine = lessons.filter(l => l.classId === x.class.id).sort((a, b) => a.title.localeCompare(b.title));
    for (const l of mine) placed.add(l.id);
    return { kind: 'class', key: `class-${x.class.id}-${x.meeting.id}`, date, class: x.class, meeting: x.meeting, lessons: mine };
  });
  const allDay = [
    ...data.assignments.filter(a => a.due === date).map(a => ({ kind: 'due', key: `due-${a.id}`, record: a, class: cls(a.classId), flag: isPastDue(a, today) ? 'Past due' : '' })),
    ...data.assignments.filter(a => a.gradeBy === date && !DONE.has(a.status)).map(a => ({ kind: 'grade', key: `grade-${a.id}`, record: a, class: cls(a.classId), flag: isLate(a, today) ? 'Late' : '' })),
    ...lessons.filter(l => !placed.has(l.id)).map(l => ({ kind: 'lesson', key: `lesson-${l.id}`, record: l, class: cls(l.classId), flag: '' })),
    ...data.tasks.filter(t => t.due === date).map(t => ({ kind: 'task', key: `task-${t.id}`, record: t, class: cls(t.classId), flag: isOverdue(t, today) ? 'Overdue' : '' })),
  ].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
    || (a.kind === 'task' ? (a.record.done - b.record.done) || PRIORITY[a.record.priority] - PRIORITY[b.record.priority] : 0)
    || a.record.title.localeCompare(b.record.title));
  return { date, dayOff, allDay, classes, count: allDay.length + classes.length };
}

/** The week holding `date`, starting on the week-start setting: [dayItems, …] for 7 days. */
export const weekDays = (date, data, today) => weekOf(date, data.settings.weekStartsOn).map(d => dayItems(d, data, today));

/** Whole weeks from the week holding `today` to the week starting `start` (0 this week, 1 next, -1 last). */
export function weeksFrom(start, today, weekStartsOn) {
  const thisStart = weekOf(today, weekStartsOn)[0];
  return Math.round((fromIso(start) - fromIso(thisStart)) / (7 * 86400000));
}
export const weekLabel = n => (n === 0 ? 'This week' : n === 1 ? 'Next week' : n === -1 ? 'Last week' : n > 1 ? `In ${n} weeks` : `${-n} weeks ago`);

/** The first day of the week before or after the one holding `date`. */
export const shiftWeek = (date, weekStartsOn, by) => iso(addDays(fromIso(weekOf(date, weekStartsOn)[0]), 7 * by));

/** How many open tasks and lesson plans have no date (so aren't on any day). */
export const undated = data => ({ tasks: data.tasks.filter(t => !t.done && !t.due).length, lessons: data.lessons.filter(l => !l.date).length });
