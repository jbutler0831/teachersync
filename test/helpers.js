import { store } from '../src/data/index.js';

// jsdom has no matchMedia; this stands in for the system light/dark setting.
export function fakeSystemTheme(dark = false) {
  const listeners = new Set();
  const query = {
    get matches() { return dark; },
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
  };
  window.matchMedia = () => query;
  return {
    set(next) { dark = next; for (const fn of listeners) fn({ matches: dark }); },
  };
}

export function resetDom() {
  window.scrollTo = () => {}; // jsdom doesn't scroll
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.head.innerHTML = '<meta name="theme-color" content="#edf0f4">';
  document.body.innerHTML = '<div id="app"></div>';
  history.replaceState(null, '', '/');
  store.load();
}

export const savedSettings = () => JSON.parse(localStorage.getItem('tsync-settings') || 'null');
