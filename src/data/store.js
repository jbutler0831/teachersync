// TeacherSync's data, saved on this device. Each collection has its own key (`tsync-classes`, `tsync-lessons`, …),
// so damage to one never costs the others. Everything goes through here:
// - Loading cleans every record. Damaged entries are skipped, and the original text is kept under `tsync-damaged`
//   so nothing is thrown away. Data from an older version is upgraded; data from a newer version is shown
//   but never written over.
// - Changes are checked first and saved before they appear. If saving fails (storage full or blocked),
//   nothing changes and the result says why.
// - Safety copies (`tsync-snapshots`) are taken before anything that replaces or removes a lot.
import { lsGet, lsSet, lsRemove } from '../lib/storage.js';
import { COLLECTIONS, TYPES, SCHEMA_VERSION, cleanRecord, cleanSettings, defaultSettings, upgrade, orphansOf } from './schema.js';
import { isPlainObject, makeId } from './fields.js';
import { makeBackup, readBackup, mergeData, countsOf, totalOf } from './backup.js';

export const KEYS = {
  classes: 'classes', daysOff: 'days-off', lessons: 'lessons', assignments: 'assignments', tasks: 'tasks',
  settings: 'settings', meta: 'meta', snapshots: 'snapshots', damaged: 'damaged',
};
const LEGACY_THEME_KEY = 'theme'; // version 0.1
const MAX_SNAPSHOTS = 10;
const SNAPSHOT_CHARS = 1_500_000; // all safety copies together, so they can't crowd out real data
const MAX_DAMAGED = 20;

export const MESSAGES = {
  saveFailed: 'Couldn’t save on this device. Storage may be full or turned off for this site. Export a backup to keep your work.',
  readOnly: 'Changes are turned off because this data needs attention. See Settings → Your data.',
  newer: 'This data was saved by a newer version of TeacherSync. It’s shown as it is, and changes are turned off so nothing is lost. Update TeacherSync to edit it.',
  noSafetyCopy: 'Couldn’t save a safety copy first, so nothing was changed. Export a backup, then try again.',
};

const parse = s => { try { return { value: JSON.parse(s) }; } catch (_) { return { error: true }; } };
const freeze = r => Object.freeze({ ...r, ...(Array.isArray(r.meetings) ? { meetings: Object.freeze(r.meetings.map(m => Object.freeze({ ...m }))) } : {}) });
const freezeSettings = s => Object.freeze({ ...s, schedule: Object.freeze({ ...s.schedule }) });
const emptyData = () => ({ ...Object.fromEntries(COLLECTIONS.map(c => [c, []])), settings: freezeSettings(defaultSettings()) });
const fail = (msg, errors = {}) => ({ ok: false, errors: { ...errors, ...(msg ? { _: msg } : {}) } });

/**
 * storage: { get(key), set(key, text) → true/false, remove(key) }, with keys already without the `tsync-` prefix.
 * now and newId can be replaced in tests.
 */
export function createStore({ storage = { get: lsGet, set: lsSet, remove: lsRemove }, now = () => Date.now(), newId = makeId } = {}) {
  let data = emptyData();
  let readOnly = false;
  let report = { problems: [], skipped: 0, migratedFrom: null, orphans: 0 };
  let metaSaved = false;
  const listeners = new Set();
  const notify = changed => { for (const fn of [...listeners]) fn(changed); };

  /* ---------- Loading ---------- */

  function load() {
    data = emptyData();
    readOnly = false;
    const problems = [], damaged = [];
    let skipped = 0, migratedFrom = null;
    // `raw` is the saved text of a whole key, or (for one bad item) the item's JSON.
    const keep = (key, raw, why) => damaged.push({ at: now(), key, why, raw });

    // Which version saved this?
    const metaText = storage.get(KEYS.meta);
    const hasData = [...COLLECTIONS, 'settings'].some(c => storage.get(KEYS[c]) !== null) || storage.get(LEGACY_THEME_KEY) !== null;
    let version = SCHEMA_VERSION, metaOk = false;
    if (metaText === null) version = hasData ? 0 : SCHEMA_VERSION;
    else {
      const m = parse(metaText).value;
      metaOk = isPlainObject(m) && Number.isInteger(m.schema) && m.schema >= 0;
      if (metaOk) version = m.schema;
      else problems.push('Some app information was damaged and has been reset. Your classes and plans weren’t affected.');
    }
    if (version > SCHEMA_VERSION) { readOnly = true; problems.push(MESSAGES.newer); }
    metaSaved = metaOk && version === SCHEMA_VERSION;

    // Read each collection on its own.
    const raw = { legacy: { theme: storage.get(LEGACY_THEME_KEY) } };
    const rewrite = new Set();
    for (const c of [...COLLECTIONS, 'settings']) {
      const text = storage.get(KEYS[c]);
      if (text === null) continue;
      const p = parse(text);
      const shapeOk = c === 'settings' ? isPlainObject(p.value) : Array.isArray(p.value);
      if (p.error || !shapeOk) {
        keep(KEYS[c], text, 'unreadable');
        rewrite.add(c);
        problems.push(c === 'settings' ? 'Your settings couldn’t be read and were reset. A copy of the damaged data was kept.'
          : `Your saved ${TYPES[c].plural} couldn’t be read. A copy of the damaged data was kept (Settings → Your data).`);
        continue;
      }
      raw[c] = p.value;
    }

    const upgraded = upgrade(raw, Math.min(version, SCHEMA_VERSION));
    if (version < SCHEMA_VERSION) migratedFrom = version;

    for (const c of COLLECTIONS) {
      const seen = new Set(), out = [];
      for (const item of Array.isArray(upgraded[c]) ? upgraded[c] : []) {
        const { record } = cleanRecord(c, item, { now: now() });
        if (!record) { keep(KEYS[c], JSON.stringify(item) ?? String(item), 'invalid record'); skipped++; rewrite.add(c); continue; }
        if (seen.has(record.id)) { record.id = newId(); rewrite.add(c); }
        seen.add(record.id);
        out.push(freeze(record));
      }
      data[c] = out;
    }
    data.settings = freezeSettings(cleanSettings(upgraded.settings).settings);
    if (skipped) problems.push(`${skipped} saved item${skipped === 1 ? '' : 's'} couldn’t be used and ${skipped === 1 ? 'was' : 'were'} set aside. A copy was kept (Settings → Your data).`);

    // Keep the damaged originals before writing anything over them. If that's impossible, write nothing.
    if (damaged.length && !readOnly && !addDamaged(damaged)) {
      readOnly = true;
      problems.push('Some saved data is damaged and there wasn’t room to keep a copy of it, so changes are turned off to protect it. Export a backup, then free up space.');
    }
    if (!readOnly) {
      const migrating = version < SCHEMA_VERSION;
      const toWrite = migrating ? [...COLLECTIONS, 'settings'].filter(c => c === 'settings' || data[c].length || storage.get(KEYS[c]) !== null) : [...rewrite];
      if (toWrite.length || migrating) {
        if (writeAll(Object.fromEntries(toWrite.map(c => [c, data[c]]))) && migrating) storage.remove(LEGACY_THEME_KEY);
      }
    }
    // Lessons or assignments whose class is gone (for example when the classes couldn't be read) are kept, not dropped.
    const orphans = orphansOf(data);
    if (orphans) problems.push(`${orphans} lesson plan${orphans === 1 ? '' : 's'} or assignment${orphans === 1 ? '' : 's'} belong to a class that’s missing. They’re kept; choose a class when you edit them.`);
    report = { problems, skipped, migratedFrom, orphans };
    notify([...COLLECTIONS, 'settings']);
    return report;
  }

  function addDamaged(entries) {
    const existing = parse(storage.get(KEYS.damaged) || '[]').value;
    const all = [...(Array.isArray(existing) ? existing : []), ...entries].slice(-MAX_DAMAGED);
    return storage.set(KEYS.damaged, JSON.stringify(all));
  }

  /* ---------- Saving ---------- */

  // Writes several collections; if any write fails, puts back the ones already written.
  function writeAll(changes) {
    const written = [];
    for (const [c, value] of Object.entries(changes)) {
      if (!storage.set(KEYS[c], JSON.stringify(value))) {
        for (const w of written) storage.set(KEYS[w], JSON.stringify(data[w]));
        return false;
      }
      written.push(c);
    }
    if (!metaSaved) metaSaved = storage.set(KEYS.meta, JSON.stringify({ app: 'TeacherSync', schema: SCHEMA_VERSION }));
    return true;
  }

  function commit(changes) {
    if (readOnly) return fail(MESSAGES.readOnly);
    if (!writeAll(changes)) return fail(MESSAGES.saveFailed);
    data = { ...data, ...changes };
    notify(Object.keys(changes));
    return { ok: true };
  }

  /* ---------- Records ---------- */

  const known = c => { if (!COLLECTIONS.includes(c)) throw new Error(`Unknown collection: ${c}`); };
  const ctx = () => ({ settings: data.settings, now: now() });

  function checkRefs(c, record, within = data) {
    const errors = {};
    for (const [field, target] of Object.entries(TYPES[c].refs || {})) {
      if (!within[target].some(r => r.id === record[field])) errors[field] = `Choose a ${TYPES[target].label}`;
    }
    return errors;
  }

  // Shared by create and update: defaults, strict checks, references.
  function build(c, input, prev) {
    const t = TYPES[c];
    const base = prev ? { ...prev, ...input, id: prev.id, createdAt: prev.createdAt } : { ...input, id: undefined, createdAt: undefined };
    const ready = t.prepare ? t.prepare(base, prev, ctx()) : base;
    const { record, errors } = cleanRecord(c, ready, { strict: true, now: now() });
    if (!record) return { errors };
    const refErrors = checkRefs(c, record);
    if (Object.keys(refErrors).length) return { errors: refErrors };
    if (!prev) record.id = newId();
    record.updatedAt = Math.max(now(), (prev && prev.updatedAt + 1) || 0);
    return { record: freeze(record) };
  }

  function create(c, input) {
    known(c);
    if (data[c].length >= TYPES[c].max) return fail(`You can have up to ${TYPES[c].max} ${TYPES[c].plural}.`);
    const { record, errors } = build(c, isPlainObject(input) ? input : {});
    if (!record) return fail(null, errors);
    const res = commit({ [c]: [...data[c], record] });
    return res.ok ? { ok: true, record } : res;
  }

  function update(c, id, patch) {
    known(c);
    const prev = get(c, id);
    if (!prev) return fail('That item no longer exists.');
    const { record, errors } = build(c, isPlainObject(patch) ? patch : {}, prev);
    if (!record) return fail(null, errors);
    const res = commit({ [c]: data[c].map(r => (r.id === id ? record : r)) });
    return res.ok ? { ok: true, record } : res;
  }

  /**
   * Removes a record. Removing a class also removes its lesson plans and assignments, after a safety copy.
   * Returns `removed` ({ collection: [records] }), which restoreRemoved() puts back (for Undo).
   */
  function remove(c, id) {
    known(c);
    // Checked first, so a removal that would fail anyway doesn't write a safety copy.
    if (readOnly) return fail(MESSAGES.readOnly);
    const target = get(c, id);
    if (!target) return fail('That item no longer exists.');
    const removed = { [c]: [target] };
    if (c === 'classes') {
      for (const dep of ['lessons', 'assignments']) {
        const hit = data[dep].filter(r => r.classId === id);
        if (hit.length) removed[dep] = hit;
      }
      if (Object.keys(removed).length > 1 && !snapshot(`Before removing the class “${target.name}”`)) return fail(MESSAGES.noSafetyCopy);
    }
    const changes = {};
    for (const [k, list] of Object.entries(removed)) {
      const ids = new Set(list.map(r => r.id));
      changes[k] = data[k].filter(r => !ids.has(r.id));
    }
    const res = commit(changes);
    return res.ok ? { ok: true, removed } : res;
  }

  /**
   * Puts back records from remove(). Ones that exist again in the meantime are left as they are, and so are
   * lesson plans and assignments whose class has been removed since (they'd have no class to show under).
   */
  function restoreRemoved(removed) {
    const changes = {};
    // Classes first, so their lessons and assignments find them.
    for (const c of COLLECTIONS) {
      if (!removed || !Array.isArray(removed[c])) continue;
      const have = new Set(data[c].map(r => r.id));
      const current = { ...data, ...changes };
      const back = removed[c].filter(r => isPlainObject(r) && !have.has(r.id) && !Object.keys(checkRefs(c, r, current)).length)
        .map(r => cleanRecord(c, r).record).filter(Boolean).map(freeze);
      if (back.length) changes[c] = [...data[c], ...back];
    }
    return Object.keys(changes).length ? commit(changes) : { ok: true };
  }

  const all = c => { known(c); return data[c]; };
  const get = (c, id) => { known(c); return data[c].find(r => r.id === id) || null; };

  /* ---------- Settings ---------- */

  function updateSettings(patch) {
    const { settings, errors } = cleanSettings({ ...data.settings, ...(isPlainObject(patch) ? patch : {}) }, { strict: true });
    if (!settings) return fail(null, errors);
    const res = commit({ settings: freezeSettings(settings) });
    return res.ok ? { ok: true, settings: data.settings } : res;
  }

  /* ---------- Whole data: backups, restore, safety copies ---------- */

  const exportData = () => ({ ...Object.fromEntries(COLLECTIONS.map(c => [c, data[c]])), settings: data.settings });
  const isEmpty = () => COLLECTIONS.every(c => !data[c].length);

  function readSnapshots() {
    const v = parse(storage.get(KEYS.snapshots) || '[]').value;
    return Array.isArray(v) ? v.filter(s => isPlainObject(s) && typeof s.id === 'string' && isPlainObject(s.backup)) : [];
  }

  /** Saves a safety copy of everything. Returns its id, or null if it couldn't be saved. Nothing to copy counts as done. */
  function snapshot(reason) {
    if (readOnly) return null; // a newer version's safety copies may not be readable here, so they're left alone
    if (isEmpty()) return 'empty';
    const entry = { id: newId(), at: now(), reason: String(reason).slice(0, 120), backup: makeBackup(exportData(), now()) };
    let list = [...readSnapshots(), entry].slice(-MAX_SNAPSHOTS);
    // Drop the oldest copies until everything fits.
    while (list.length) {
      const text = JSON.stringify(list);
      if (text.length <= SNAPSHOT_CHARS && storage.set(KEYS.snapshots, text)) return entry.id;
      if (list.length === 1) break;
      list = list.slice(1);
    }
    return null;
  }

  const snapshots = () => readSnapshots().map(({ id, at, reason, backup }) => ({ id, at, reason, counts: countsOf(backup.data || {}) })).reverse();

  /**
   * Restores data, usually from readBackup(). It's checked and cleaned again here, so nothing unchecked is ever saved.
   * mode 'replace': everything (including settings) becomes the backup's.
   * mode 'merge': adds what's missing; where both have the same item, the more recently changed one is kept.
   * Either way, when this device last exported a backup stays as it is.
   * A safety copy of what was here is saved first.
   */
  function restore(raw, mode, reason = 'Before restoring a backup') {
    if (readOnly) return fail(MESSAGES.readOnly);
    if (mode !== 'replace' && mode !== 'merge') throw new Error(`Unknown restore mode: ${mode}`);
    const checked = readBackup(makeBackup(isPlainObject(raw) ? raw : {}, now()));
    if (!checked.ok) return fail(checked.error);
    const incoming = checked.data;
    if (!snapshot(reason)) return fail(MESSAGES.noSafetyCopy);
    const { data: next, summary } = mode === 'replace'
      ? { data: incoming, summary: { added: totalOf(countsOf(incoming)), updated: 0, unchanged: 0 } }
      : mergeData(exportData(), incoming);
    const changes = {};
    for (const c of COLLECTIONS) changes[c] = next[c].map(freeze);
    changes.settings = mode === 'replace' ? freezeSettings({ ...next.settings, lastExportAt: data.settings.lastExportAt }) : data.settings;
    const res = commit(changes);
    return res.ok ? { ok: true, summary } : res;
  }

  function restoreSnapshot(id) {
    const s = readSnapshots().find(x => x.id === id);
    if (!s) return fail('That safety copy is gone.');
    const r = readBackup(s.backup);
    if (!r.ok) return fail(r.error);
    return restore(r.data, 'replace', 'Before going back to a safety copy');
  }

  function damagedCopies() {
    const v = parse(storage.get(KEYS.damaged) || '[]').value;
    return Array.isArray(v) ? v : [];
  }

  return {
    load, all, get, create, update, remove, restoreRemoved,
    settings: () => data.settings, updateSettings,
    exportData, snapshot, snapshots, restore, restoreSnapshot, damagedCopies,
    report: () => report, isReadOnly: () => readOnly,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
