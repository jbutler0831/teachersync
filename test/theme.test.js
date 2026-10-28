import { describe, it, expect, beforeEach } from 'vitest';
import { fakeSystemTheme, resetDom, savedSettings } from './helpers.js';
import { store } from '../src/data/index.js';
import { initTheme, themePref, currentTheme, setThemePref, toggleTheme, onThemeChange } from '../src/lib/theme.js';

const themeColor = () => document.querySelector('meta[name="theme-color"]').getAttribute('content');

describe('theme', () => {
  let system;
  beforeEach(() => { resetDom(); system = fakeSystemTheme(false); });

  it('follows the system when nothing was chosen', () => {
    initTheme();
    expect(themePref()).toBe('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(currentTheme()).toBe('light');
    system.set(true);
    expect(currentTheme()).toBe('dark');
    expect(themeColor()).toBe('#0b1017');
  });

  it('saves an explicit choice and restores it on the next start', () => {
    setThemePref('dark');
    expect(savedSettings().theme).toBe('dark');
    document.documentElement.removeAttribute('data-theme');
    store.load();
    initTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(currentTheme()).toBe('dark');
    expect(themeColor()).toBe('#0b1017');
  });

  it('a choice wins over the system setting', () => {
    setThemePref('light');
    system.set(true);
    expect(currentTheme()).toBe('light');
  });

  it('going back to System clears the saved choice', () => {
    setThemePref('dark');
    setThemePref('system');
    expect(savedSettings().theme).toBe('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(themePref()).toBe('system');
  });

  it('ignores a damaged saved value', () => {
    localStorage.setItem('tsync-settings', JSON.stringify({ theme: 'purple' }));
    store.load();
    initTheme();
    expect(themePref()).toBe('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('moves the theme saved by version 0.1 into settings', () => {
    localStorage.clear();
    localStorage.setItem('tsync-theme', 'dark');
    store.load();
    initTheme();
    expect(currentTheme()).toBe('dark');
    expect(savedSettings().theme).toBe('dark');
    expect(localStorage.getItem('tsync-theme')).toBeNull();
  });

  it('follows settings brought in by a restore', () => {
    initTheme();
    store.restore({ ...store.exportData(), settings: { ...store.settings(), theme: 'dark' } }, 'replace');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('toggles and tells listeners', () => {
    const seen = [];
    const off = onThemeChange(t => seen.push(t));
    toggleTheme();
    toggleTheme();
    off();
    toggleTheme();
    expect(seen).toEqual(['dark', 'light']);
  });
});
