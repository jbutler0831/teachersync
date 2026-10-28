// Rules for single fields. Each rule takes a raw value and returns { value, error }:
// `value` is always safe to save (the cleaned value, or the default when it couldn't be used),
// and `error` is a message for forms when something was wrong. Rules marked `required` make the
// whole record unusable when they fail.
import { iso, fromIso } from '../lib/dates.js';

const ok = value => ({ value });
const bad = (value, error) => ({ value, error });
const empty = raw => raw === undefined || raw === null || raw === '';
const required = rule => Object.assign(rule, { required: true });

export const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// Control characters other than tab and newline never belong in what a person typed.
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g;

/** Text up to `max` characters. Single-line text has its spaces collapsed; multiline keeps line breaks. */
export function text(max, { req = false, multiline = false } = {}) {
  const rule = raw => {
    if (empty(raw)) return req ? bad('', 'Required') : ok('');
    if (typeof raw !== 'string' && typeof raw !== 'number') return bad('', 'Must be text');
    let s = String(raw).replace(/\r\n?/g, '\n').replace(CONTROL, '');
    s = multiline ? s.replace(/[^\S\n]+$/gm, '').trim() : s.replace(/\s+/g, ' ').trim();
    if (!s) return req ? bad('', 'Required') : ok('');
    if (s.length > max) return bad(s.slice(0, max), `Keep it to ${max} characters or fewer`);
    return ok(s);
  };
  return req ? required(rule) : rule;
}

export const isIsoDate = s => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const y = +s.slice(0, 4);
  return y >= 1900 && y <= 2200 && iso(fromIso(s)) === s;
};

/** A calendar day, 'YYYY-MM-DD', or null. */
export function date({ req = false } = {}) {
  const rule = raw => {
    if (empty(raw)) return req ? bad(null, 'Required') : ok(null);
    return isIsoDate(raw) ? ok(raw) : bad(null, 'Not a valid date');
  };
  return req ? required(rule) : rule;
}

/** A time of day, 'HH:MM' (24-hour). Accepts '8:05' and stores '08:05'. */
export function time({ req = false } = {}) {
  const rule = raw => {
    if (empty(raw)) return req ? bad(null, 'Required') : ok(null);
    const m = typeof raw === 'string' && raw.match(/^(\d{1,2}):(\d{2})$/);
    if (!m || +m[1] > 23 || +m[2] > 59) return bad(null, 'Not a valid time');
    return ok(`${m[1].padStart(2, '0')}:${m[2]}`);
  };
  return req ? required(rule) : rule;
}

export function oneOf(values, fallback) {
  return raw => (empty(raw) ? ok(fallback) : values.includes(raw) ? ok(raw) : bad(fallback, 'Not a valid choice'));
}

/** A whole number from min to max. Without a fallback it's required. */
export function int(min, max, fallback) {
  const rule = raw => {
    if (empty(raw)) return fallback === undefined ? bad(null, 'Required') : ok(fallback);
    const n = typeof raw === 'string' && raw.trim() ? Number(raw) : raw;
    if (typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max) return ok(n);
    return bad(fallback ?? null, `Must be a whole number from ${min} to ${max}`);
  };
  return fallback === undefined ? required(rule) : rule;
}

export function bool(fallback = false) {
  return raw => (empty(raw) ? ok(fallback) : typeof raw === 'boolean' ? ok(raw) : bad(fallback, 'Must be yes or no'));
}

/** A moment in time (milliseconds since 1970), or null. */
export function stamp() {
  return raw => (empty(raw) ? ok(null) : Number.isFinite(raw) && raw > 0 ? ok(Math.round(raw)) : bad(null, 'Not a valid time'));
}

export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** The id of another record (for example a lesson's class). With `req: false`, it can also be empty (null). */
export function ref({ req = true } = {}) {
  const rule = raw => (typeof raw === 'string' && ID_RE.test(raw) ? ok(raw) : !req && empty(raw) ? ok(null) : bad(null, 'Choose one'));
  return req ? required(rule) : rule;
}

/**
 * Cleans an object against a map of rules. Unknown properties are dropped.
 * Returns { value, errors, fatal }: `fatal` is true when a required field failed.
 */
export function cleanFields(rules, raw) {
  const src = isPlainObject(raw) ? raw : {};
  const value = {}, errors = {};
  let fatal = !isPlainObject(raw);
  for (const [k, rule] of Object.entries(rules)) {
    const r = rule(Object.hasOwn(src, k) ? src[k] : undefined);
    value[k] = r.value;
    if (r.error) { errors[k] = r.error; if (rule.required) fatal = true; }
  }
  return { value, errors, fatal };
}

/** A list of nested objects. Items that can't be used are left out (and reported); at most `max`. */
export function list(itemRules, max, { check, label = 'item' } = {}) {
  return raw => {
    if (empty(raw)) return ok([]);
    if (!Array.isArray(raw)) return bad([], 'Must be a list');
    const out = [];
    let error;
    for (const item of raw) {
      const r = cleanFields(itemRules, item);
      const problem = r.fatal ? Object.values(r.errors)[0] : check && check(r.value);
      if (problem) { error = error || `A ${label} isn’t valid: ${problem.toLowerCase()}`; if (r.fatal) continue; }
      out.push(r.value);
    }
    if (out.length > max) return bad(out.slice(0, max), `At most ${max} ${label}s`);
    return error ? bad(out, error) : ok(out);
  };
}

/** A random id. Uses getRandomValues, which (unlike randomUUID) also works over plain http on a phone. */
export function makeId() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, b => (b % 36).toString(36)).join('');
}
