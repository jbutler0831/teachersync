import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const listFiles = dir => readdirSync(dir, { withFileTypes: true })
  .flatMap(e => (e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)]));

// Fonts come in many alphabets; only the Latin ones are saved up front (others download if a page needs them),
// and only .woff2, which every browser that can install the app reads.
const precached = file => !/\.(woff2?)$/.test(file) || /-latin-[^/]*\.woff2$/.test(file);

/** After a build, writes sw.js with the list of built files to save for offline use and a version from their contents. */
export function serviceWorker() {
  return {
    name: 'teachersync-service-worker',
    apply: 'build',
    writeBundle(options) {
      const dir = options.dir;
      const files = listFiles(dir)
        .map(f => relative(dir, f).split(sep).join('/'))
        .filter(f => f !== 'sw.js' && precached(f))
        .sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(dir, f)));
      const urls = ['./', ...files.map(f => `./${f}`)];
      const sw = readFileSync(new URL('./src/sw-template.js', import.meta.url), 'utf8')
        .replace("'__VERSION__'", JSON.stringify(hash.digest('hex').slice(0, 12)))
        .replace('__PRECACHE__', JSON.stringify(urls, null, 2));
      writeFileSync(join(dir, 'sw.js'), sw);
    },
  };
}

export default defineConfig({
  // Relative paths, so the built app works from any folder or subpath (GitHub Pages, Netlify, …).
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
  plugins: [serviceWorker()],
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.js'],
  },
});
