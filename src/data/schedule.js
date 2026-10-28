// Which classes meet on a given day, and meeting times that overlap. Today, Classes and Week build on this.
// Only weekly schedules exist for now. A rotating schedule (A/B days, 6-day cycles) will be a new
// settings.schedule.kind that maps a date to a cycle day; meetings will then match on that instead of the weekday.
import { fromIso, addDays, iso } from '../lib/dates.js';

/** The day off covering this date ('YYYY-MM-DD'), or null. */
export function dayOffOn(date, daysOff) {
  return daysOff.find(d => d.start <= date && date <= (d.end || d.start)) || null;
}

/** Every class meeting on this date, by start time: [{ class, meeting }]. None on days off. */
export function meetingsOn(date, { classes, daysOff, settings }) {
  if (dayOffOn(date, daysOff)) return [];
  if (settings.schedule.kind !== 'weekly') return [];
  const weekday = fromIso(date).getDay();
  return classes
    .flatMap(c => c.meetings.filter(m => m.day === weekday).map(meeting => ({ class: c, meeting })))
    .sort((a, b) => a.meeting.start.localeCompare(b.meeting.start) || a.class.name.localeCompare(b.class.name));
}

/** Two meetings overlap when they're on the same weekday and their times cross. Back-to-back (8:50 and 8:50) is fine. */
export const overlap = (a, b) => a.day === b.day && a.start < b.end && b.start < a.end;

/** The first two of these meetings that overlap, as [a, b], or null. */
export function findOverlap(meetings) {
  for (let i = 0; i < meetings.length; i++) {
    for (let j = i + 1; j < meetings.length; j++) if (overlap(meetings[i], meetings[j])) return [meetings[i], meetings[j]];
  }
  return null;
}

/** Meetings of other classes that overlap these meetings: [{ class, meeting, mine }]. `ignoreId` is the class being edited. */
export function conflicts(meetings, classes, ignoreId) {
  const out = [];
  for (const c of classes) {
    if (c.id === ignoreId) continue;
    for (const meeting of c.meetings) for (const mine of meetings) if (overlap(mine, meeting)) out.push({ class: c, meeting, mine });
  }
  return out;
}

/**
 * Meetings with the same times, grouped: [{ days: [1, 3, 5], start, end }], earliest first.
 * Days are in week order (Monday first when weekStartsOn is 1).
 */
export function groupMeetings(meetings, weekStartsOn = 1) {
  const order = d => (d - weekStartsOn + 7) % 7;
  const groups = new Map();
  for (const m of meetings) {
    const k = `${m.start}-${m.end}`;
    if (!groups.has(k)) groups.set(k, { days: [], start: m.start, end: m.end });
    if (!groups.get(k).days.includes(m.day)) groups.get(k).days.push(m.day);
  }
  return [...groups.values()]
    .map(g => ({ ...g, days: g.days.sort((a, b) => order(a) - order(b)) }))
    .sort((a, b) => a.start.localeCompare(b.start) || order(a.days[0]) - order(b.days[0]));
}

/** The seven dates ('YYYY-MM-DD') of the week holding `date`, starting on weekStartsOn (0 Sunday, 1 Monday). */
export function weekOf(date, weekStartsOn = 1) {
  const d = fromIso(date);
  const first = addDays(d, -((d.getDay() - weekStartsOn + 7) % 7));
  return Array.from({ length: 7 }, (_, i) => iso(addDays(first, i)));
}
