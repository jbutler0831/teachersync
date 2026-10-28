// @vitest-environment node
// The installable-app pieces: manifest, icons, the page's links to them, and the service worker the build writes.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';

const root = new URL('..', import.meta.url).pathname;
const read = p => readFileSync(join(root, p), 'utf8');
const pngSize = p => { const b = readFileSync(join(root, p)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

describe('manifest and icons', () => {
  const m = JSON.parse(read('public/manifest.webmanifest'));

  it('has what browsers need to offer Install', () => {
    expect(m.name).toBe('TeacherSync');
    expect(m.short_name.length).toBeLessThanOrEqual(12);
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('./#/today');
    expect(m.scope).toBe('./');
    const sizes = m.icons.filter(i => i.type === 'image/png' && i.purpose === 'any').map(i => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(m.icons.some(i => i.purpose === 'maskable')).toBe(true);
  });

  it('every icon exists at the size it claims', () => {
    for (const i of m.icons) {
      expect(existsSync(join(root, 'public', i.src)), i.src).toBe(true);
      if (i.type === 'image/png') expect(pngSize(join('public', i.src)).join('x')).toBe(i.sizes);
    }
    expect(pngSize('public/icons/apple-touch-icon.png')).toEqual([180, 180]);
  });

  it('index.html links the manifest and icons, and its early theme script uses the store’s keys', () => {
    const html = read('index.html');
    expect(html).toContain('href="./manifest.webmanifest"');
    expect(html).toContain('href="./icons/apple-touch-icon.png"');
    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain("localStorage.getItem('tsync-settings')");
    expect(html).toContain("localStorage.getItem('tsync-theme')"); // version 0.1, before the store moves it
    expect(read('src/data/store.js')).toMatch(/settings: 'settings'/);
    expect(read('src/data/store.js')).toMatch(/LEGACY_THEME_KEY = 'theme'/);
  });
});

describe('separation from SemesterSync', () => {
  it('no source file uses SemesterSync storage keys or its server', () => {
    const files = readdirSync(join(root, 'src'), { recursive: true }).filter(f => /\.(js|css)$/.test(f));
    for (const f of files) {
      // Code only: comments may mention SemesterSync to explain the separation.
      const src = read(join('src', f)).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/['"`]ssync-/);
      expect(src, f).not.toMatch(/SEMESTERSYNC_|supabase/i);
    }
    expect(read('index.html')).not.toMatch(/ssync-/);
  });
});

describe('production build', () => {
  let out;
  beforeAll(async () => {
    out = mkdtempSync(join(tmpdir(), 'teachersync-build-'));
    await build({ root, logLevel: 'silent', build: { outDir: out, emptyOutDir: true } });
  }, 60000);
  afterAll(() => rmSync(out, { recursive: true, force: true }));

  it('writes sw.js with a version and a list of files that all exist', () => {
    const sw = readFileSync(join(out, 'sw.js'), 'utf8');
    expect(sw).not.toContain('__VERSION__');
    expect(sw).not.toContain('__PRECACHE__');
    const list = JSON.parse(sw.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1]);
    expect(list).toContain('./');
    expect(list).toContain('./index.html');
    expect(list).toContain('./manifest.webmanifest');
    for (const u of list.filter(u => u !== './')) expect(existsSync(join(out, u)), u).toBe(true);
  });

  it('saves the app code and styles for offline use', () => {
    const list = readFileSync(join(out, 'sw.js'), 'utf8');
    const assets = readdirSync(join(out, 'assets')).filter(f => /\.(js|css)$/.test(f));
    expect(assets.length).toBeGreaterThanOrEqual(2);
    for (const a of assets) expect(list).toContain(`./assets/${a}`);
  });

  it('uses relative paths so it works from any folder', () => {
    const html = readFileSync(join(out, 'index.html'), 'utf8');
    expect(html).toMatch(/src="\.\/assets\/index-[\w-]+\.js"/);
    expect(html).not.toMatch(/(src|href)="\/(?!\/)/);
  });
});
