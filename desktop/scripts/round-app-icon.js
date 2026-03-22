#!/usr/bin/env node
/**
 * Normalizes assets/icon.png for macOS Dock / Windows:
 * 1) Drops dark/black background — keeps only the light (white) logo on transparency.
 * 2) Trims, scales into a safe zone, centers (slightly larger zone so white-only doesn’t feel tiny).
 * 3) Applies outer rounded-rectangle mask (squircle-friendly).
 *
 * Run: npm run icons:round
 * Then: npm run icons:tray
 */
const fs = require('fs');
const path = require('path');

/** Glyph max dimension vs canvas — a bit larger than 0.7 because white-only reads smaller on dark Dock. */
const SAFE_ZONE = 0.8;

/**
 * Convert black/dark plate to transparent; output pure white with alpha (anti-aliased edges).
 */
async function whiteOnlyOnTransparent(inputBuf) {
  const sharp = require('sharp');
  const { data, info } = await sharp(inputBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const out = Buffer.alloc(w * h * 4, 0);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      const lum = (r + g + b) / 3;
      if (a < 15 || lum < 42) continue;

      const oi = i;
      // Soft edge between dark plate (~0–30) and white strokes (~200+)
      let outA = a;
      if (lum < 155) {
        const t = (lum - 42) / (155 - 42);
        outA = Math.round(a * Math.max(0, Math.min(1, t)));
      }
      if (outA < 8) continue;

      out[oi] = 255;
      out[oi + 1] = 255;
      out[oi + 2] = 255;
      out[oi + 3] = outA;
    }
  }

  return sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

async function main() {
  const sharp = require('sharp');
  const assetsDir = path.join(__dirname, '..', 'assets');
  const iconPath = path.join(assetsDir, 'icon.png');
  const tmpPath = iconPath + '.rounded.tmp.png';

  if (!fs.existsSync(iconPath)) {
    console.error('Missing', iconPath);
    process.exit(1);
  }

  let input = await fs.promises.readFile(iconPath);
  input = await whiteOnlyOnTransparent(input);

  const meta = await sharp(input).metadata();
  const w = meta.width || 512;
  const h = meta.height || 512;
  const maxGlyph = Math.round(Math.min(w, h) * SAFE_ZONE);

  const trimmed = await sharp(input).ensureAlpha().trim().png().toBuffer();
  const tm = await sharp(trimmed).metadata();
  const tw = tm.width || 1;
  const th = tm.height || 1;
  const scale = Math.min(maxGlyph / tw, maxGlyph / th, 1);
  const nw = Math.max(1, Math.round(tw * scale));
  const nh = Math.max(1, Math.round(th * scale));

  const resized = await sharp(trimmed).resize(nw, nh, { kernel: sharp.kernel.lanczos3 }).png().toBuffer();

  const left = Math.floor((w - nw) / 2);
  const top = Math.floor((h - nh) / 2);

  const r = Math.max(10, Math.round(Math.min(w, h) * 0.24));
  const svg = Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="white"/></svg>`,
  );

  const centered = await sharp({
    create: {
      width: w,
      height: h,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resized, left, top }])
    .png()
    .toBuffer();

  await sharp(centered)
    .ensureAlpha()
    .composite([{ input: svg, blend: 'dest-in' }])
    .png()
    .toFile(tmpPath);

  const outSz = (await fs.promises.stat(tmpPath)).size;
  if (outSz < 3000) {
    await fs.promises.unlink(tmpPath).catch(() => {});
    throw new Error(`round-app-icon produced tiny file (${outSz} bytes); refusing to overwrite icon.png`);
  }

  await fs.promises.rename(tmpPath, iconPath);
  console.log(
    `Icon ${w}×${h}: white-only, ~${Math.round(SAFE_ZONE * 100)}% safe zone (${nw}×${nh}), rx=${r} → ${iconPath}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
