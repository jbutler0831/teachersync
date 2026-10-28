// Calendar-day helpers from SemesterSync. Dates are local calendar days, stored as 'YYYY-MM-DD',
// so a lesson on Oct 27 stays on Oct 27 whatever the time zone or daylight saving does.
export const DAY = 86400000;
export const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const fromIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** "Mon" for weekday 1, in the person's language. (January 2, 2000 was a Sunday.) */
export const shortWeekday = (day, locale) => new Date(2000, 0, 2 + day).toLocaleDateString(locale, { weekday: 'short' });
/** "8:05 AM" (or "08:05", depending on the language) for a stored 'HH:MM'. */
export const fmtTime = (hhmm, locale) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
};
/** "Thu, Nov 26". */
export const fmtDay = (d, locale) => d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });

/** "Tuesday, October 27" in the person's language (or the one given). */
export const fmtLongDate = (d, locale) => d.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' });

export function greeting(d) {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
