// The app's one data store, saved in this browser's storage. main.js calls store.load() at startup.
import { createStore, KEYS } from './store.js';
import { PREFIX } from '../lib/storage.js';

export const store = createStore();

// Keys whose change in another tab means this tab's copy is out of date. (Safety copies and damaged data aren't shown.)
const WATCHED = new Set(['classes', 'daysOff', 'lessons', 'assignments', 'tasks', 'settings', 'meta'].map(c => PREFIX + KEYS[c]));

/**
 * With TeacherSync open in two tabs, a change saved in one reloads the other, so neither saves over the other's
 * work with an old copy. `key` is null when storage was cleared. Returns a function that stops listening.
 */
export function followOtherTabs(target = store, win = window) {
  const onStorage = e => {
    if (e.storageArea && e.storageArea !== win.localStorage) return;
    if (e.key === null || WATCHED.has(e.key)) target.load();
  };
  win.addEventListener('storage', onStorage);
  return () => win.removeEventListener('storage', onStorage);
}
