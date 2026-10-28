// The page heading every section shares, and the empty-state card.
import { esc } from '../lib/dom.js';
import { ICONS } from '../lib/icons.js';

export const viewHead = ({ eyebrow, title, lede }) => `
  <header class="view-head">
    ${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ''}
    <h1 tabindex="-1">${esc(title)}</h1>
    ${lede ? `<p class="lede">${esc(lede)}</p>` : ''}
  </header>`;

export const emptyCard = ({ icon, heading, body, points = [], action }) => `
  <div class="panel empty">
    <div class="empty-icon">${ICONS[icon] || ''}</div>
    <h2>${esc(heading)}</h2>
    <p>${esc(body)}</p>
    ${points.length ? `<ul>${points.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
    ${action ? `<a class="btn primary" href="${esc(action.href)}">${esc(action.label)}</a>` : ''}
  </div>`;
