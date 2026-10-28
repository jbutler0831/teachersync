// Builds the frame around every page: sidebar (computers), top bar, tab bar (phones), and the page itself.
import { ROUTES } from './routes.js';
import { hrefFor } from './router.js';
import { ICONS } from './lib/icons.js';
import { esc } from './lib/dom.js';
import { fmtLongDate } from './lib/dates.js';
import { currentTheme, toggleTheme, onThemeChange } from './lib/theme.js';

const link = (r, cls = '') => `<a href="${hrefFor(r.id)}" data-route="${r.id}"${cls ? ` class="${cls}"` : ''}>${ICONS[r.icon]}<span>${esc(r.label)}</span></a>`;
const iconLink = r => `<a href="${hrefFor(r.id)}" data-route="${r.id}" class="icon-btn phone-only" aria-label="${esc(r.label)}" title="${esc(r.label)}">${ICONS[r.icon]}</a>`;

export function mountShell(root) {
  const daily = ROUTES.filter(r => r.tab), other = ROUTES.filter(r => !r.tab);
  root.innerHTML = `
    <a class="skip" href="#main">Skip to content</a>
    <div class="app">
      <aside class="sidebar">
        <a class="brand" href="${hrefFor('today')}">${ICONS.logo}<b>TeacherSync</b></a>
        <nav class="side-nav" aria-label="Sections">
          ${daily.map(r => link(r)).join('')}
          <p class="eyebrow group">Setup</p>
          ${other.map(r => link(r)).join('')}
        </nav>
        <p class="side-foot">Saved on this device</p>
      </aside>
      <header class="topbar">
        <a class="brand" href="${hrefFor('today')}">${ICONS.logo}<b>TeacherSync</b></a>
        <span class="today-label" id="todayLabel"></span>
        <div class="actions">
          ${other.map(iconLink).join('')}
          <button type="button" class="icon-btn" id="themeBtn"></button>
        </div>
      </header>
      <main id="main" class="content" tabindex="-1"><div id="view"></div></main>
      <nav class="tabbar" aria-label="Sections">${daily.map(r => link(r)).join('')}</nav>
    </div>
    <div class="toast" id="toast" role="status" aria-live="polite"></div>`;

  const themeBtn = root.querySelector('#themeBtn');
  const paintThemeBtn = () => {
    const dark = currentTheme() === 'dark';
    themeBtn.innerHTML = dark ? ICONS.sun : ICONS.moon;
    themeBtn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    themeBtn.title = dark ? 'Light mode' : 'Dark mode';
  };
  themeBtn.addEventListener('click', toggleTheme);
  onThemeChange(paintThemeBtn);
  paintThemeBtn();

  const view = root.querySelector('#view');
  return {
    /** Shows a section. After the first page, focus moves to its heading so screen readers announce it. */
    show(route, { initial = false } = {}) {
      for (const a of root.querySelectorAll('a[data-route]')) {
        if (a.dataset.route === route.id) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      }
      document.title = route.id === 'today' ? 'TeacherSync' : `${route.label} · TeacherSync`;
      root.querySelector('#todayLabel').textContent = fmtLongDate(new Date());
      route.view.render(view);
      if (!initial) {
        window.scrollTo?.(0, 0);
        const h1 = view.querySelector('h1');
        (h1 || root.querySelector('#main')).focus({ preventScroll: true });
      }
    },
  };
}
