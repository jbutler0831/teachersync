// @vitest-environment node
// Text colors stay readable (WCAG AA, 4.5:1) in light and dark themes, and focus stays visible.
// jsdom can't render colors, so this reads the design tokens from tokens.css and computes the contrast.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = file => readFileSync(new URL(`../src/styles/${file}`, import.meta.url), 'utf8');
const tokens = css('tokens.css');
const block = start => Object.fromEntries([...tokens.slice(tokens.indexOf(start)).split('}')[0].matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map(m => [m[1], m[2]]));
const light = block(':root {');
const dark = { ...light, ...block(':root[data-theme="dark"]') };
const darkMedia = { ...light, ...block(':root:not([data-theme="light"]) {') };

const lum = hex => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// Text color → the backgrounds it's used on.
const PAIRS = [
  ['ink', ['bg', 'surface', 'surface-2']],
  ['muted', ['bg', 'surface', 'surface-2']],
  ['faint', ['bg', 'surface', 'surface-2']],
  ['accent', ['bg', 'surface', 'accent-soft']],
  ['crit', ['surface', 'crit-soft']],
  ['good', ['surface', 'good-soft']],
  ['warn', ['surface', 'warn-soft']],
  ['accent-ink', ['accent', 'crit']],          // text on primary and danger buttons
];

describe('text contrast (WCAG AA 4.5:1)', () => {
  for (const [name, theme] of [['light', light], ['dark', dark]]) {
    it(`${name} theme: every text color on every background it's used on`, () => {
      const low = [];
      for (const [fg, bgs] of PAIRS) for (const bg of bgs) {
        const r = ratio(theme[fg], theme[bg]);
        if (r < 4.5) low.push(`--${fg} on --${bg}: ${r.toFixed(2)}`);
      }
      expect(low).toEqual([]);
    });
  }

  it('the dark colors are the same whether dark comes from the system or the theme switch', () => {
    expect(darkMedia).toEqual(dark);
  });
});

describe('visible states', () => {
  it('finished classes on Today are quieter without transparency (which lowered text contrast to 3.2:1)', () => {
    expect(css('views.css')).not.toMatch(/\.slot\.is-done\s*\{[^}]*opacity/);
  });

  it('form fields show a focus ring, also on a date field’s own calendar button', () => {
    expect(css('base.css')).toMatch(/\.field-in:focus, \.field-in:focus-within \{[^}]*box-shadow: 0 0 0 3px/);
  });

  it('danger buttons use the theme’s ink, not fixed white (2.7:1 on the dark theme’s red)', () => {
    expect(css('base.css')).toMatch(/\.btn\.primary\.danger \{[^}]*color: var\(--accent-ink\)/);
  });
});
