// An in-memory stand-in for the device's storage, with a size limit and switchable failures.
import { createStore } from '../../src/data/store.js';

export function memoryStorage({ quota = Infinity } = {}) {
  const map = new Map();
  const used = () => [...map.entries()].reduce((n, [k, v]) => n + k.length + v.length, 0);
  const s = {
    map,
    failWrites: false,      // every write fails, as when storage is blocked
    failKeys: new Set(),    // writes to these keys fail
    get: k => (map.has(k) ? map.get(k) : null),
    set(k, v) {
      if (s.failWrites || s.failKeys.has(k)) return false;
      const before = map.get(k);
      map.set(k, v);
      if (used() > quota) { if (before === undefined) map.delete(k); else map.set(k, before); return false; }
      return true;
    },
    remove: k => { map.delete(k); },
    json: k => JSON.parse(map.get(k)),
  };
  return s;
}

/** A store on memory storage, with a clock that moves forward a second per call and numbered ids. */
export function testStore(storage = memoryStorage()) {
  let t = Date.UTC(2026, 9, 27, 12);
  let n = 0;
  const store = createStore({ storage, now: () => (t += 1000), newId: () => `id${++n}` });
  store.load();
  return { store, storage };
}

export const sampleClass = (over = {}) => ({
  name: 'Biology 1', subject: 'Science', room: '204', color: 's3',
  meetings: [{ day: 1, start: '08:00', end: '08:50' }, { day: 3, start: '08:00', end: '08:50' }],
  ...over,
});
