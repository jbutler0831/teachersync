import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fakeSystemTheme, resetDom, savedSettings } from './helpers.js';
import { initTheme } from '../src/lib/theme.js';
import { mountShell } from '../src/shell.js';
import { startRouter, routeFromHash, hrefFor } from '../src/router.js';
import { ROUTES } from '../src/routes.js';

const go = id => { location.hash = hrefFor(id); window.dispatchEvent(new HashChangeEvent('hashchange')); };
const current = sel => [...document.querySelectorAll(`${sel} a[aria-current="page"]`)].map(a => a.dataset.route);

describe('routes', () => {
  it('reads the section from the address', () => {
    expect(routeFromHash('#/lessons').id).toBe('lessons');
    expect(routeFromHash('#/lessons/123').id).toBe('lessons');
    expect(routeFromHash('#lessons').id).toBe('lessons');
    expect(routeFromHash('').id).toBe('today');
    expect(routeFromHash('#/nope').id).toBe('today');
  });

  it('has five phone tabs and unique ids', () => {
    expect(ROUTES.filter(r => r.tab)).toHaveLength(5);
    expect(new Set(ROUTES.map(r => r.id)).size).toBe(ROUTES.length);
  });
});

describe('app shell', () => {
  let stop;
  beforeEach(() => {
    resetDom();
    fakeSystemTheme(false);
    initTheme();
    const shell = mountShell(document.getElementById('app'));
    stop = startRouter((route, opts) => shell.show(route, opts));
  });
  afterEach(() => stop());

  it('opens on Today and fixes the address', () => {
    expect(location.hash).toBe('#/today');
    expect(document.querySelector('h1').textContent).toMatch(/^Good (morning|afternoon|evening)\.$/);
    expect(document.title).toBe('TeacherSync');
    expect(current('.side-nav')).toEqual(['today']);
    expect(current('.tabbar')).toEqual(['today']);
  });

  it('lists every section in the sidebar and the five daily ones in the tab bar', () => {
    expect([...document.querySelectorAll('.side-nav a')].map(a => a.dataset.route)).toEqual(ROUTES.map(r => r.id));
    expect([...document.querySelectorAll('.tabbar a')].map(a => a.textContent)).toEqual(['Today', 'Week', 'Lessons', 'Assignments', 'Tasks']);
    expect([...document.querySelectorAll('.topbar a.phone-only')].map(a => a.getAttribute('aria-label'))).toEqual(['Classes', 'Settings']);
  });

  it('every section renders, marks its links and moves focus to its heading', () => {
    go('settings'); // start elsewhere: a browser never signals a change to the address already shown
    for (const r of ROUTES) {
      go(r.id);
      const h1 = document.querySelector('#view h1');
      expect(h1, r.id).toBeTruthy();
      expect(document.activeElement).toBe(h1);
      expect(document.querySelector('#view').innerHTML).not.toMatch(/undefined|\[object/);
      expect(document.querySelectorAll(`a[data-route="${r.id}"][aria-current="page"]`).length).toBeGreaterThan(0);
      expect(document.querySelectorAll('a[aria-current="page"]:not([data-route="' + r.id + '"])')).toHaveLength(0);
      if (r.id !== 'today') expect(document.title).toBe(`${r.label} · TeacherSync`);
    }
  });

  it('a repeated or late signal for the address already shown doesn’t draw it again', () => {
    go('lessons');
    const before = document.querySelector('#view section');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(document.querySelector('#view section')).toBe(before);
  });

  it('sends unknown addresses to Today', () => {
    go('lessons');
    location.hash = '#/missing';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(location.hash).toBe('#/today');
    expect(current('.tabbar')).toEqual(['today']);
  });

  it('the theme button switches and labels itself', () => {
    const btn = document.getElementById('themeBtn');
    expect(btn.getAttribute('aria-label')).toBe('Switch to dark mode');
    btn.click();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(btn.getAttribute('aria-label')).toBe('Switch to light mode');
  });

  it('Settings shows and changes the theme choice, and follows the top-bar button', () => {
    go('settings');
    const pressed = () => document.querySelector('.seg [aria-pressed="true"]').dataset.themePref;
    expect(pressed()).toBe('system');
    document.querySelector('[data-theme-pref="dark"]').click();
    expect(pressed()).toBe('dark');
    expect(savedSettings().theme).toBe('dark');
    document.getElementById('themeBtn').click();
    expect(pressed()).toBe('light');
    document.querySelector('[data-theme-pref="system"]').click();
    expect(savedSettings().theme).toBe('system');
  });

  it('has a skip link to the content', () => {
    const skip = document.querySelector('a.skip');
    expect(skip.getAttribute('href')).toBe('#main');
    expect(document.getElementById('main')).toBeTruthy();
  });
});

describe('skip link', () => {
  let stop;
  beforeEach(() => {
    resetDom();
    fakeSystemTheme(false);
    initTheme();
    const shell = mountShell(document.getElementById('app'));
    location.hash = '#/lessons';
    stop = startRouter((route, opts) => shell.show(route, opts));
  });
  afterEach(() => stop());

  it('moves focus to the content and stays on the same section (it used to jump to Today)', () => {
    const skip = document.querySelector('a.skip');
    expect(skip.textContent).toBe('Skip to content');
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    skip.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(document.getElementById('main'));
    expect(location.hash).toBe('#/lessons');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(document.querySelector('#view h1').textContent).toBe('Lesson plans');
  });
});
