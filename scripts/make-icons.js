// Draws the app icons (public/icons/*.png, and desktop/icon.png for the Mac app) from the same shapes as
// favicon.svg, with no image tools needed.
// Run with `npm run icons` after changing the mark.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0x1e, 0x40, 0xc8], HL = [0xff, 0xe9, 0x4d], INK = [0xff, 0xff, 0xff];
// The mark on a 32-unit grid, matching favicon.svg.
const STROKES = [
  { color: HL, w: 3.2, pts: [[8, 23], [24, 23]] },
  { color: INK, w: 3, pts: [[9.5, 13.5], [13.7, 17.7], [22.5, 9]] },
];

function segDist(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
function inRoundRect(x, y, size, r) {
  const cx = Math.min(Math.max(x, r), size - r), cy = Math.min(Math.max(y, r), size - r);
  return Math.hypot(x - cx, y - cy) <= r;
}

// rounded: transparent corners (radius 8/32). glyphScale: shrink the mark for maskable icons' safe zone.
function pixels(size, { rounded, glyphScale = 1 }) {
  const px = new Uint8Array(size * size * 4), SS = 4, unit = 32 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const ux = (x + (sx + 0.5) / SS) * unit, uy = (y + (sy + 0.5) / SS) * unit;
          if (rounded && !inRoundRect(ux, uy, 32, 8)) continue;
          // Map back into the mark's own coordinates when it's scaled around the center.
          const gx = (ux - 16) / glyphScale + 16, gy = (uy - 16) / glyphScale + 16;
          let c = BG;
          for (const s of STROKES) {
            for (let i = 0; i < s.pts.length - 1; i++) if (segDist(gx, gy, s.pts[i], s.pts[i + 1]) <= s.w / 2) c = s.color;
          }
          r += c[0]; g += c[1]; b += c[2]; a += 255;
        }
      }
      const n = SS * SS, cover = a / 255, o = (y * size + x) * 4;
      if (cover) { px[o] = r / cover; px[o + 1] = g / cover; px[o + 2] = b / cover; }
      px[o + 3] = a / n;
    }
  }
  return px;
}
const draw = (size, opts) => png(size, pixels(size, opts));

// A Mac app icon: the rounded square at Apple's grid size (824 of 1024), centered, with transparent margins.
function macIcon(canvas = 1024, inner = 824) {
  const px = new Uint8Array(canvas * canvas * 4), icon = pixels(inner, { rounded: true }), off = (canvas - inner) / 2;
  for (let y = 0; y < inner; y++) px.set(icon.subarray(y * inner * 4, (y + 1) * inner * 4), ((y + off) * canvas + off) * 4);
  return png(canvas, px);
}

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = buf => { let c = -1; for (const byte of buf) c = CRC[(c ^ byte) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) raw.set(rgba.subarray(y * size * 4, (y + 1) * size * 4), y * (size * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const out = new URL('../public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });
const icons = {
  'icon-192.png': draw(192, { rounded: true }),
  'icon-512.png': draw(512, { rounded: true }),
  // Android crops maskable icons to its own shape; keep the mark inside the central safe zone.
  'maskable-512.png': draw(512, { rounded: false, glyphScale: 0.72 }),
  // iOS rounds the corners itself and shows transparent corners as black.
  'apple-touch-icon.png': draw(180, { rounded: false }),
};
for (const [name, data] of Object.entries(icons)) writeFileSync(new URL(name, out), data);
console.log(`Wrote ${Object.keys(icons).join(', ')} to public/icons/`);

// electron-builder turns this into the Mac .icns.
const desktop = new URL('../desktop/', import.meta.url);
mkdirSync(desktop, { recursive: true });
writeFileSync(new URL('icon.png', desktop), macIcon());
console.log('Wrote desktop/icon.png');
