// Helpers for the desktop app that don't need Electron, so they can be tested on their own.
// The app's files are served on app://teachersync/…, a fixed address, so the data the app saves
// (localStorage, keyed by address) stays put from one version to the next.
const path = require('node:path');
const crypto = require('node:crypto');

const SCHEME = 'app';
const HOST = 'teachersync';
const ORIGIN = `${SCHEME}://${HOST}`;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8',
};

/** The file under `root` for an app:// URL, or null when the URL isn't the app's or would leave `root`. */
function fileFor(url, root) {
  let u;
  try { u = new URL(url); } catch (_) { return null; }
  if (u.protocol !== `${SCHEME}:` || u.host !== HOST) return null;
  let rel;
  try { rel = decodeURIComponent(u.pathname); } catch (_) { return null; }
  if (rel === '' || rel === '/') rel = '/index.html';
  const base = path.resolve(root);
  const file = path.resolve(base, `.${rel}`);
  return file.startsWith(base + path.sep) ? file : null;
}

const contentType = file => TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';

/**
 * The Content-Security-Policy for the app's page: only its own files, plus its inline <script>s by hash
 * (index.html applies the saved theme before the first paint). Inline style attributes are allowed (class colors).
 */
function csp(html) {
  const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map(m => `'sha256-${crypto.createHash('sha256').update(m[1], 'utf8').digest('base64')}'`);
  return [
    "default-src 'self'",
    `script-src 'self'${hashes.length ? ` ${hashes.join(' ')}` : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** Pages inside the app. Everything else is never loaded in the app window. */
const isAppUrl = url => typeof url === 'string' && url.startsWith(`${ORIGIN}/`);
/** Links that may open in the person's browser or mail app. */
const isExternal = url => typeof url === 'string' && /^(https?:|mailto:)/i.test(url);

module.exports = { SCHEME, HOST, ORIGIN, fileFor, contentType, csp, isAppUrl, isExternal };
