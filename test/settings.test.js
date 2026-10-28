import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeSystemTheme, resetDom } from './helpers.js';
import { store } from '../src/data/index.js';
import { initTheme } from '../src/lib/theme.js';
import { mountShell } from '../src/shell.js';
import { startRouter } from '../src/router.js';

describe('Settings → Your data', () => {
  let stop;
  const open = () => {
    const shell = mountShell(document.getElementById('app'));
    location.hash = '#/settings';
    stop = startRouter((route, opts) => shell.show(route, opts));
  };
  beforeEach(() => { resetDom(); fakeSystemTheme(false); initTheme(); });
  afterEach(() => { stop && stop(); vi.restoreAllMocks(); });

  it('shows what’s saved and that no backup was made yet', () => {
    const c = store.create('classes', { name: 'Bio' }).record;
    store.create('lessons', { classId: c.id, title: 'Cells', date: '2026-10-27' });
    open();
    const text = document.getElementById('dataPanels').textContent;
    expect(text).toContain('1 class and 1 lesson plan');
    expect(text).toContain('Last backup: never');
    expect(document.getElementById('dataNotice').textContent).toBe('');
  });

  it('Export backup downloads a TeacherSync backup and records when', () => {
    store.create('tasks', { title: 'Copies' });
    let blob;
    URL.createObjectURL = vi.fn(b => { blob = b; return 'blob:x'; });
    URL.revokeObjectURL = vi.fn();
    const clicks = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { clicks.push(this.download); });
    open();
    document.querySelector('[data-act="export"]').click();
    expect(clicks[0]).toMatch(/^TeacherSync-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(blob.type).toBe('application/json');
    expect(store.settings().lastExportAt).toBeGreaterThan(0);
    expect(document.getElementById('dataPanels').textContent).not.toContain('Last backup: never');
    return blob.text().then(t => {
      const b = JSON.parse(t);
      expect(b.app).toBe('TeacherSync');
      expect(b.data.tasks[0].title).toBe('Copies');
    });
  });

  it('explains damaged data and offers the copy that was kept', () => {
    localStorage.setItem('tsync-meta', JSON.stringify({ app: 'TeacherSync', schema: 1 }));
    localStorage.setItem('tsync-lessons', '{broken');
    store.load();
    open();
    const notice = document.getElementById('dataNotice');
    expect(notice.textContent).toMatch(/needs attention/);
    expect(notice.textContent).toMatch(/lesson plans couldn’t be read/);
    expect(notice.querySelector('[data-act="damaged"]')).toBeTruthy();
  });

  it('lists safety copies, newest first', () => {
    store.create('tasks', { title: 'x' });
    store.snapshot('First');
    store.snapshot('Second');
    open();
    const items = [...document.querySelectorAll('.snap-list li')].map(li => li.textContent);
    expect(items).toHaveLength(2);
    expect(items[0]).toContain('Second');
  });

  it('grading days: saves a valid number and explains an invalid one', () => {
    open();
    const input = document.getElementById('gradingDays');
    expect(input.value).toBe('3');
    input.value = '5';
    input.dispatchEvent(new Event('change'));
    expect(store.settings().gradingDays).toBe(5);
    input.value = '500';
    input.dispatchEvent(new Event('change'));
    expect(store.settings().gradingDays).toBe(5);
    expect(document.getElementById('gradingErr').textContent).toMatch(/0 to 60/);
    expect(input.value).toBe('5');
  });

  it('visiting Settings again doesn’t repeat actions', () => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const clicks = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    open();
    location.hash = '#/today'; window.dispatchEvent(new HashChangeEvent('hashchange'));
    location.hash = '#/settings'; window.dispatchEvent(new HashChangeEvent('hashchange'));
    document.querySelector('[data-act="export"]').click();
    expect(clicks).toHaveBeenCalledTimes(1);
  });

  it('week start choice is saved', () => {
    open();
    document.querySelector('[data-week-start="0"]').click();
    expect(store.settings().weekStartsOn).toBe(0);
    expect(document.querySelector('[data-week-start="0"]').getAttribute('aria-pressed')).toBe('true');
  });
});
