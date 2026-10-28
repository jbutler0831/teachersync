// Calendar export: an iCalendar (.ics, RFC 5545) file of what TeacherSync has dated, to import into Apple Calendar,
// Google Calendar or Outlook. It's a one-time copy, not a sync. Every event has a stable UID, so importing a
// newer export over an older one updates events in calendars that honor UIDs.
//
// - Class meetings: timed events, one per meeting in the range (days off skipped), as UTC times computed from
//   the teacher's local time on that date, so daylight-saving changes come out right.
// - Lesson plans, assignment due dates, grading deadlines (until graded), open tasks: all-day events on their date.
// - Days off: all-day events spanning the break.
// Only names, rooms and statuses are written; notes, instructions and app timestamps stay in TeacherSync.
// Records without a date are left out; nothing is invented. Nothing is saved or changed.
import { meetingsOn } from './schedule.js';
import { DONE } from './assignments.js';
import { LESSON_STATUS, ASSIGNMENT_STATUS, TASK_PRIORITY } from './schema.js';
import { addDays, fromIso, iso } from '../lib/dates.js';

export const KINDS = [
  ['class', 'Class meetings'],
  ['lesson', 'Lesson plans'],
  ['due', 'Assignment due dates'],
  ['grade', 'Grading deadlines'],
  ['task', 'Tasks'],
  ['off', 'Days off'],
];
const LESSON = Object.fromEntries(LESSON_STATUS);
const ASSIGNMENT = Object.fromEntries(ASSIGNMENT_STATUS);
const PRIORITY = Object.fromEntries(TASK_PRIORITY);
const DOMAIN = 'teachersync.app';

/** Escapes TEXT values: backslash, semicolon, comma and line breaks. */
export const escapeText = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');

/** Folds a content line to at most 75 octets per line (UTF-8), continuing with CRLF and a space; never splits a character. */
export function fold(line) {
  const enc = new TextEncoder();
  const out = [];
  let cur = '', size = 0, limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (size + n > limit) { out.push(cur); cur = ''; size = 0; limit = 74; } // continuation lines start with a space
    cur += ch;
    size += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const ymd = date => date.replace(/-/g, '');
/** A local date and 'HH:MM' as a UTC date-time (e.g. 20261123T130000Z), using the teacher's time zone rules for that date. */
export function utcStamp(date, hhmm) {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = hhmm.split(':').map(Number);
  return new Date(y, m - 1, d, h, min).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
const nextDay = date => iso(addDays(fromIso(date), 1));
const datesIn = (from, to) => { const out = []; for (let d = from; d <= to; d = nextDay(d)) out.push(d); return out; };

/**
 * The events of the chosen kinds from `from` to `to` (inclusive 'YYYY-MM-DD'), in date order:
 * [{ kind, uid, summary, description, location, start, end, allDay }]. start/end are dates for all-day events
 * (end exclusive) and UTC stamps for timed ones.
 */
export function calendarEvents(data, { from, to, kinds = KINDS.map(([k]) => k) }) {
  const want = new Set(kinds);
  const name = id => (data.classes.find(c => c.id === id) || {}).name || '';
  const inRange = d => d && d >= from && d <= to;
  const allDay = (kind, id, date, summary, description, endDate = date) =>
    ({ kind, uid: `${kind}-${id}@${DOMAIN}`, summary, description, location: '', start: date, end: nextDay(endDate), allDay: true, sort: `${date} 0` });
  const events = [];
  if (want.has('class')) {
    for (const date of datesIn(from, to)) {
      for (const { class: c, meeting: m } of meetingsOn(date, data)) {
        events.push({ kind: 'class', uid: `class-${c.id}-${m.id}-${ymd(date)}@${DOMAIN}`, summary: c.name, description: ['Class', c.subject].filter(Boolean).join(' · '),
          location: c.room ? `Room ${c.room}` : '', start: utcStamp(date, m.start), end: utcStamp(date, m.end), allDay: false, sort: `${date} 1${m.start}` });
      }
    }
  }
  if (want.has('lesson')) for (const l of data.lessons) if (inRange(l.date)) events.push(allDay('lesson', l.id, l.date, `Lesson plan: ${l.title}`, [name(l.classId), LESSON[l.status]].filter(Boolean).join(' · ')));
  if (want.has('due')) for (const a of data.assignments) if (inRange(a.due)) events.push(allDay('due', a.id, a.due, `Due: ${a.title}`, [name(a.classId), ASSIGNMENT[a.status]].filter(Boolean).join(' · ')));
  if (want.has('grade')) for (const a of data.assignments) if (inRange(a.gradeBy) && !DONE.has(a.status)) events.push(allDay('grade', a.id, a.gradeBy, `Grade by: ${a.title}`, [name(a.classId), ASSIGNMENT[a.status]].filter(Boolean).join(' · ')));
  if (want.has('task')) for (const t of data.tasks) if (!t.done && inRange(t.due)) events.push(allDay('task', t.id, t.due, `Task: ${t.title}`, [name(t.classId), `${PRIORITY[t.priority]} priority`].filter(Boolean).join(' · ')));
  // A break that overlaps the range is exported whole.
  if (want.has('off')) for (const d of data.daysOff) if (d.start <= to && (d.end || d.start) >= from) events.push(allDay('off', d.id, d.start, `No classes: ${d.title}`, 'Day off', d.end || d.start));
  return events.sort((a, b) => a.sort.localeCompare(b.sort) || a.summary.localeCompare(b.summary));
}

/** The .ics text (CRLF line endings, folded lines) for these events. `now` is the export time (DTSTAMP). */
export function toICS(events, { now = new Date(), name = 'TeacherSync' } = {}) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TeacherSync//TeacherSync//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapeText(name)}`];
  const category = Object.fromEntries(KINDS);
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`);
    if (e.allDay) lines.push(`DTSTART;VALUE=DATE:${ymd(e.start)}`, `DTEND;VALUE=DATE:${ymd(e.end)}`, 'TRANSP:TRANSPARENT');
    else lines.push(`DTSTART:${e.start}`, `DTEND:${e.end}`);
    lines.push(`SUMMARY:${escapeText(e.summary)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    lines.push(`CATEGORIES:${escapeText(category[e.kind])}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

export const icsFileName = (from, to) => `TeacherSync-${from}-to-${to}.ics`;
export const ICS_TYPE = 'text/calendar;charset=utf-8';
