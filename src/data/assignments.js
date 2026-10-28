// Assignment status rules, shared by Assignments and Today, so both always agree.
//
// - Past due: still Assigned after its due date (collect it, then mark it To grade).
// - Late: To grade after its grading deadline.
// - Graded and Returned are never past due or late; neither is anything without the date in question.
// Dates are calendar days ('YYYY-MM-DD') compared with the teacher's own today, so time zones don't shift them.
import { matchesText } from './search.js';
import { addDays, fromIso, iso } from '../lib/dates.js';

export const DONE = new Set(['graded', 'returned']);
/** The usual next step from each status: [status, button label]. */
export const NEXT_STEP = { assigned: ['to-grade', 'Mark To grade'], 'to-grade': ['graded', 'Mark graded'], graded: ['returned', 'Mark returned'] };

export const isPastDue = (a, today) => a.status === 'assigned' && !!a.due && a.due < today;
export const isLate = (a, today) => a.status === 'to-grade' && !!a.gradeBy && a.gradeBy < today;
/** Needs the teacher: past due (to collect) or waiting to be graded. */
export const needsAttention = (a, today) => isPastDue(a, today) || a.status === 'to-grade';

// Most urgent first: late grading, then past due, then the rest of To grade; within each, the oldest date first.
const urgency = (a, today) => (isLate(a, today) ? 0 : isPastDue(a, today) ? 1 : 2);
const keyDate = a => (a.status === 'to-grade' ? a.gradeBy || a.due : a.due) || '9999-12-31';
const byTitle = (a, b) => a.title.localeCompare(b.title);

export const VIEWS = [
  ['attention', 'Needs attention'],
  ['upcoming', 'Upcoming'],
  ['done', 'Graded'],
  ['all', 'All'],
];
export const DUE = [['', 'Any time'], ['today', 'Due today'], ['week', 'Due in the next 7 days'], ['past', 'Due date passed'], ['none', 'No due date']];

const inView = {
  attention: needsAttention,
  upcoming: (a, today) => a.status === 'assigned' && (!a.due || a.due >= today),
  done: a => DONE.has(a.status),
  all: () => true,
};

/** How many assignments each view holds. */
export const viewCounts = (list, today) => Object.fromEntries(VIEWS.map(([v]) => [v, list.filter(a => inView[v](a, today)).length]));

/**
 * Filters and sorts for the list. `filters`: { view, query, classId ('' all, 'missing'), status ('' any), due (see DUE) }.
 * - Needs attention: most urgent first.  - Upcoming: soonest due first, no due date last.
 * - Graded and All: most recent due date first, no due date last.
 */
export function filterAssignments(list, classes, filters, today) {
  const { view = 'attention', query = '', classId = '', status = '', due = '' } = filters;
  const names = new Map(classes.map(c => [c.id, c.name]));
  const weekEnd = iso(addDays(fromIso(today), 7));
  const out = list.filter(a => {
    if (!inView[view](a, today)) return false;
    if (classId === 'missing' ? names.has(a.classId) : classId && a.classId !== classId) return false;
    if (status && a.status !== status) return false;
    if (due === 'today' && a.due !== today) return false;
    if (due === 'week' && !(a.due && a.due >= today && a.due <= weekEnd)) return false;
    if (due === 'past' && !(a.due && a.due < today)) return false;
    if (due === 'none' && a.due) return false;
    return matchesText([a.title, a.description, a.notes, names.get(a.classId)], query);
  });
  if (view === 'attention') return out.sort((a, b) => urgency(a, today) - urgency(b, today) || keyDate(a).localeCompare(keyDate(b)) || byTitle(a, b));
  if (view === 'upcoming') return out.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || byTitle(a, b));
  return out.sort((a, b) => (b.due || '0000').localeCompare(a.due || '0000') || byTitle(a, b));
}
