// @vitest-environment node
// The desktop app's helpers (desktop/lib.cjs) and packaging settings. Electron itself isn't started here;
// the built app is checked by launching it (see README).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { ORIGIN, fileFor, contentType, csp, isAppUrl, isExternal } = require('../desktop/lib.cjs');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const ROOT = path.resolve('/app/dist');

describe('serving the app’s files', () => {
  it('maps app:// addresses to files in the app, with index.html for the root', () => {
    expect(ORIGIN).toBe('app://teachersync');
    expect(fileFor('app://teachersync/', ROOT)).toBe(path.join(ROOT, 'index.html'));
    expect(fileFor('app://teachersync/index.html#/today', ROOT)).toBe(path.join(ROOT, 'index.html'));
    expect(fileFor('app://teachersync/assets/index-abc.js?v=1', ROOT)).toBe(path.join(ROOT, 'assets/index-abc.js'));
    expect(fileFor('app://teachersync/icons/My%20Icon.png', ROOT)).toBe(path.join(ROOT, 'icons/My Icon.png'));
  });

  it('never serves anything outside the app, or for another address', () => {
    for (const url of [
      'app://teachersync/../../etc/passwd', 'app://teachersync/%2e%2e/%2e%2e/etc/passwd', 'app://teachersync/..%2f..%2fsecret',
      'app://teachersync/%2e%2e%5c..%5csecret', 'app://teachersync/%E0%A4%A', 'app://other/index.html', 'file:///etc/passwd',
      'https://teachersync/index.html', 'not a url',
    ]) {
      const f = fileFor(url, ROOT);
      expect(f === null || f.startsWith(ROOT + path.sep), url).toBe(true);
    }
    expect(fileFor('app://other/index.html', ROOT)).toBeNull();
    // The URL parser turns %2e%2e into .. and stops at the root, so this stays inside the app…
    expect(fileFor('app://teachersync/%2e%2e/%2e%2e/etc/passwd', ROOT)).toBe(path.join(ROOT, 'etc/passwd'));
    // …and an escape that only appears after decoding is refused by the guard.
    expect(fileFor('app://teachersync/..%2f..%2fsecret', ROOT)).toBeNull();
  });

  it('sends the right content types', () => {
    expect(contentType('a/index.html')).toBe('text/html; charset=utf-8');
    expect(contentType('a/x.JS')).toBe('text/javascript; charset=utf-8');
    expect(contentType('a/f.woff2')).toBe('font/woff2');
    expect(contentType('a/m.webmanifest')).toBe('application/manifest+json');
    expect(contentType('a/unknown.bin')).toBe('application/octet-stream');
  });
});

describe('security', () => {
  it('the page may run only its own scripts, plus its inline theme script by exact hash', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const inline = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    const policy = csp(html);
    expect(policy).toContain(`script-src 'self' 'sha256-${createHash('sha256').update(inline).digest('base64')}'`);
    expect(policy).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(policy).toMatch(/default-src 'self'.*object-src 'none'.*base-uri 'none'/);
    expect(csp('<p>no scripts</p>')).toContain("script-src 'self';");
  });

  it('only app pages load in the window; web and mail links go to other apps', () => {
    expect(isAppUrl('app://teachersync/index.html#/week')).toBe(true);
    expect(isAppUrl('app://teachersyncevil.com/')).toBe(false);
    expect(isAppUrl('https://example.com')).toBe(false);
    expect(isExternal('https://example.com/a')).toBe(true);
    expect(isExternal('mailto:office@school.org')).toBe(true);
    expect(isExternal('file:///etc/passwd')).toBe(false);
    expect(isExternal('javascript:alert(1)')).toBe(false);
  });

  it('the window is sandboxed with no Node.js access', () => {
    const main = readFileSync(new URL('../desktop/main.cjs', import.meta.url), 'utf8');
    expect(main).toMatch(/contextIsolation: true, nodeIntegration: false, sandbox: true/);
    expect(main).toMatch(/setPermissionRequestHandler\([^)]*\) => callback\(false\)\)/);
    expect(main).not.toMatch(/preload|enableRemoteModule|webSecurity: false|toggleDevTools/);
  });
});

describe('packaging', () => {
  it('builds a universal Mac .dmg from the web build, with the app’s icon', () => {
    expect(pkg.main).toBe('desktop/main.cjs');
    expect(existsSync(new URL('../desktop/main.cjs', import.meta.url))).toBe(true);
    expect(pkg.build.files).toEqual(['dist/**/*', 'desktop/main.cjs', 'desktop/lib.cjs', 'package.json']);
    expect(pkg.build.mac.target).toEqual([{ target: 'dmg', arch: ['universal'] }]);
    expect(pkg.build.directories.output).toBe('release');
    const icon = readFileSync(new URL('../desktop/icon.png', import.meta.url));
    expect([icon.readUInt32BE(16), icon.readUInt32BE(20)]).toEqual([1024, 1024]);
  });

  it('ships no runtime dependencies (Vite bundles everything into dist/), and versions are exact', () => {
    expect(pkg.dependencies).toBeUndefined();
    for (const v of Object.values(pkg.devDependencies)) expect(v).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('the desktop build doesn’t register the web app’s offline worker', () => {
    expect(readFileSync(new URL('../src/pwa.js', import.meta.url), 'utf8')).toContain("location.protocol === 'app:'");
  });
});
