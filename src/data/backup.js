// Backup files: one .json file with every class, day off, lesson plan, assignment, task and setting.
// Reading a backup only ever produces TeacherSync's own collections. Anything else in the file is ignored,
// so a backup can't write over other data on the device (safety copies, other apps' data, …).
import { COLLECTIONS, TYPES, SCHEMA_VERSION, cleanRecord, cleanSettings, upgrade, orphansOf } from './schema.js';
import { isPlainObject, makeId } from './fields.js';
import { iso } from '../lib/dates.js';

export const MAX_BACKUP_CHARS = 20_000_000;
export const countsOf = d => Object.fromEntries(COLLECTIONS.map(c => [c, Array.isArray(d[c]) ? d[c].length : 0]));
export const totalOf = counts => Object.values(counts).reduce((a, n) => a + n, 0);

export function makeBackup(data, at = Date.now()) {
  return {
    app: 'TeacherSync',
    kind: 'backup',
    schema: SCHEMA_VERSION,
    exportedAt: new Date(at).toISOString(),
    data: { ...Object.fromEntries(COLLECTIONS.map(c => [c, data[c]])), settings: data.settings },
  };
}

export const backupText = (data, at = Date.now()) => JSON.stringify(makeBackup(data, at), null, 2);
export const backupFileName = (at = Date.now()) => `TeacherSync-backup-${iso(new Date(at))}.json`;

const no = error => ({ ok: false, error });
const NOT_OURS = 'This file isn’t a TeacherSync backup.';

/** Reads the text of a backup file. See readBackup for the result. */
export function parseBackup(text) {
  if (typeof text !== 'string' || !text.trim()) return no(NOT_OURS);
  if (text.length > MAX_BACKUP_CHARS) return no('This file is too large to be a TeacherSync backup.');
  let obj;
  try { obj = JSON.parse(text); } catch (_) { return no('This file is damaged or isn’t a TeacherSync backup.'); }
  return readBackup(obj);
}

/**
 * Checks and cleans a backup object.
 * Returns { ok: true, data, counts, skipped, orphans, exportedAt } or { ok: false, error } with a message for people.
 * Items that can't be used are skipped and counted; the rest is kept. Lesson plans and assignments whose class
 * isn't in the backup are kept too, and counted in `orphans`.
 */
export function readBackup(obj) {
  if (!isPlainObject(obj)) return no(NOT_OURS);
  if (obj.app !== 'TeacherSync') {
    if (obj.app === 'SemesterSync' || Array.isArray(obj.courses)) return no('This is a SemesterSync backup. TeacherSync can only restore its own backups.');
    return no(NOT_OURS);
  }
  if (!Number.isInteger(obj.schema) || obj.schema < 0 || !isPlainObject(obj.data)) return no('This backup is damaged and can’t be restored.');
  if (obj.schema > SCHEMA_VERSION) return no('This backup was made by a newer version of TeacherSync. Update TeacherSync to restore it.');

  const raw = upgrade({ ...Object.fromEntries(COLLECTIONS.map(c => [c, obj.data[c]])), settings: obj.data.settings }, obj.schema);
  const data = {};
  let skipped = 0;
  for (const c of COLLECTIONS) {
    const seen = new Set();
    data[c] = [];
    for (const item of Array.isArray(raw[c]) ? raw[c] : []) {
      const { record } = cleanRecord(c, item);
      if (!record) { skipped++; continue; }
      if (seen.has(record.id)) record.id = makeId();
      seen.add(record.id);
      data[c].push(record);
    }
  }
  data.settings = cleanSettings(raw.settings).settings;
  const at = typeof obj.exportedAt === 'string' && !Number.isNaN(Date.parse(obj.exportedAt)) ? obj.exportedAt : null;
  return { ok: true, data, counts: countsOf(data), skipped, orphans: orphansOf(data), exportedAt: at };
}

/**
 * Combines a backup with what's already here, item by item (matched by id):
 * new items are added; where both have an item, the more recently changed copy is kept.
 * Settings stay as they are. Returns { data, summary: { added, updated, unchanged } }.
 */
export function mergeData(current, incoming) {
  const summary = { added: 0, updated: 0, unchanged: 0 };
  const data = { settings: current.settings };
  for (const c of COLLECTIONS) {
    const byId = new Map(current[c].map(r => [r.id, r]));
    const added = [];
    for (const r of incoming[c]) {
      const mine = byId.get(r.id);
      if (!mine) { added.push(r); summary.added++; }
      else if (JSON.stringify(mine) !== JSON.stringify(r) && r.updatedAt > mine.updatedAt) { byId.set(r.id, r); summary.updated++; }
      else summary.unchanged++;
    }
    data[c] = [...byId.values(), ...added];
  }
  return { data, summary };
}

/** "3 classes, 1 day off and 12 lesson plans", or "nothing". */
export function describeCounts(counts) {
  const parts = COLLECTIONS.filter(c => counts[c]).map(c => `${counts[c]} ${counts[c] === 1 ? TYPES[c].label : TYPES[c].plural}`);
  if (!parts.length) return 'nothing';
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
