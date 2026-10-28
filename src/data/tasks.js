// Task status rules, shared by Tasks and Today, so both always agree.
//
// - Overdue: not done and due before today.  - Due today: not done and due today.
// - Done tasks are never overdue; reopening one goes back to whatever its due date says.
// - A task with no due date is never overdue and never gets one invented.
// Dates are calendar days ('YYYY-MM-DD') compared with the teacher's own today. Time passing never changes a record.
import { matchesText } from './search.js';
import { addDays, fromIso, iso } from '../lib/dates.js';

export const isOverdue = (t, today) => !t.done && !!t.due && t.due < today;
export const isDueToday = (t, today) => !t.done && t.due === today;

const PRIORITY = { high: 0, normal: 1, low: 2 };
// Open tasks: overdue (oldest first), then due today, then by due date, then no date; higher priority first within.
const openRank = (t, today) => (isOverdue(t, today) ? 0 : isDueToday(t, today) ? 1 : t.due ? 2 : 3);
export function compareOpen(a, b, today) {
  return openRank(a, today) - openRank(b, today) || (a.due || '').localeCompare(b.due || '')
    || PRIORITY[a.priority] - PRIORITY[b.priority] || a.title.localeCompare(b.title);
}

export const VIEWS = [
  ['open', 'To do'],
  ['attention', 'Needs attention'],
  ['upcoming', 'Upcoming'],
  ['done', 'Done'],
  ['all', 'All'],
];
export const DUE = [['', 'Any time'], ['overdue', 'Overdue'], ['today', 'Due today'], ['week', 'Due in the next 7 days'], ['none', 'No due date']];

const inView = {
  open: t => !t.done,
  attention: (t, today) => isOverdue(t, today) || isDueToday(t, today),
  upcoming: (t, today) => !t.done && !!t.due && t.due > today,
  done: t => t.done,
  all: () => true,
};

export const viewCounts = (list, today) => Object.fromEntries(VIEWS.map(([v]) => [v, list.filter(t => inView[v](t, today)).length]));

/**
 * Filters and sorts. `filters`: { view, query, classId ('' all, 'none' no class, 'missing'), priority ('' any), due (see DUE) }.
 * Open views put urgent work first. Done: most recently completed first. All: open ones (urgent first), then done.
 */
export function filterTasks(list, classes, filters, today) {
  const { view = 'open', query = '', classId = '', priority = '', due = '' } = filters;
  const names = new Map(classes.map(c => [c.id, c.name]));
  const weekEnd = iso(addDays(fromIso(today), 7));
  const out = list.filter(t => {
    if (!inView[view](t, today)) return false;
    if (classId === 'none' ? t.classId : classId === 'missing' ? !t.classId || names.has(t.classId) : classId && t.classId !== classId) return false;
    if (priority && t.priority !== priority) return false;
    if (due === 'overdue' && !isOverdue(t, today)) return false;
    if (due === 'today' && t.due !== today) return false;
    if (due === 'week' && !(t.due && t.due >= today && t.due <= weekEnd)) return false;
    if (due === 'none' && t.due) return false;
    return matchesText([t.title, t.description, names.get(t.classId)], query);
  });
  const doneOrder = (a, b) => (b.doneAt || 0) - (a.doneAt || 0) || a.title.localeCompare(b.title);
  return out.sort((a, b) => (a.done !== b.done ? (a.done ? 1 : -1) : a.done ? doneOrder(a, b) : compareOpen(a, b, today)));
}
