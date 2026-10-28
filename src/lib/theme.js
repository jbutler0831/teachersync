// Light, dark or the system setting. Adapted from SemesterSync's theme toggle: an explicit choice is saved
// (settings.theme) and set as data-theme on <html>; "system" removes it and lets prefers-color-scheme decide.
// index.html applies a saved choice before the first paint, so there's no flash of the wrong theme.
import { store } from '../data/index.js';

const BAR_COLOR = { light: '#edf0f4', dark: '#0b1017' };
const listeners = new Set();
const root = () => document.documentElement;
const darkQuery = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null);

/** What the person chose: 'light', 'dark' or 'system'. */
export const themePref = () => store.settings().theme;

/** What's on screen right now: 'light' or 'dark'. */
export function currentTheme() {
  const t = root().getAttribute('data-theme');
  if (t === 'light' || t === 'dark') return t;
  const q = darkQuery();
  return q && q.matches ? 'dark' : 'light';
}

function apply(pref) {
  if (pref === 'light' || pref === 'dark') root().setAttribute('data-theme', pref);
  else root().removeAttribute('data-theme');
  changed();
}

/** Shows the theme at once; saves it when possible (if saving fails it still applies until the page closes). */
export function setThemePref(pref) {
  const p = pref === 'light' || pref === 'dark' ? pref : 'system';
  // Once started, a saved change reaches apply() through the store subscription below.
  if (!store.updateSettings({ theme: p }).ok || !started) apply(p);
}

export const toggleTheme = () => setThemePref(currentTheme() === 'dark' ? 'light' : 'dark');

/** Calls fn(currentTheme) after every change, including the system switching. Returns an unsubscribe function. */
export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let started = false;
export function initTheme() {
  apply(themePref());
  if (started) return;
  started = true;
  const q = darkQuery();
  if (q && q.addEventListener) q.addEventListener('change', changed);
  // A restored backup can bring a different theme.
  store.subscribe(changedKeys => { if (changedKeys.includes('settings')) apply(themePref()); });
}

function changed() {
  const theme = currentTheme();
  // The browser bar and the installed app's title bar follow the page.
  const meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (meta) meta.setAttribute('content', BAR_COLOR[theme]);
  for (const fn of [...listeners]) fn(theme);
}
