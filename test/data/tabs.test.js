// TeacherSync open in two tabs of the same browser.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createStore } from '../../src/data/store.js';
import { followOtherTabs } from '../../src/data/index.js';

const fire = (key, storageArea = localStorage) => window.dispatchEvent(new StorageEvent('storage', { key, storageArea }));

describe('another tab', () => {
  let tabA, tabB, stop;
  beforeEach(() => {
    localStorage.clear();
    tabA = createStore();
    tabB = createStore();
    tabA.load();
    tabB.load();
    stop = followOtherTabs(tabB);
  });
  afterEach(() => stop());

  it('a change saved in one tab shows up in the other', () => {
    tabA.create('tasks', { title: 'From tab A' });
    fire('tsync-tasks');
    expect(tabB.all('tasks').map(t => t.title)).toEqual(['From tab A']);
  });

  it('so the other tab’s next change doesn’t save over it', () => {
    tabA.create('tasks', { title: 'From tab A' });
    fire('tsync-tasks');
    tabB.create('tasks', { title: 'From tab B' });
    tabA.load();
    expect(tabA.all('tasks').map(t => t.title)).toEqual(['From tab A', 'From tab B']);
  });

  it('ignores other apps’ keys, safety copies, and other storage', () => {
    let loads = 0;
    const off = tabB.subscribe(() => loads++);
    fire('ssync-courses');
    fire('tsync-snapshots');
    fire('tsync-tasks', sessionStorage);
    fire(null);
    off();
    expect(loads).toBe(1); // only the storage-cleared event
  });

  it('stops when asked', () => {
    stop();
    tabA.create('tasks', { title: 'x' });
    fire('tsync-tasks');
    expect(tabB.all('tasks')).toEqual([]);
  });
});
