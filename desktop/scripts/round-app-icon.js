#!/usr/bin/env node
/**
 * Normalizes assets/icon.png for macOS Dock / Windows:
 * 1) Keeps the dark background so the icon is visible on both light and dark mode.
 * 2) Resizes to 512x512 and applies outer rounded-rectangle mask (squircle-friendly).
 *
 * Run: npm run icons:round
 * Then: npm run icons:tray
 */
const fs = require('fs');
const path = require('path');

async function main() {
  const sharp = require('sharp');
  const assetsDir = path.join(__dirname, '..', 'assets');
  const iconPath = path.join(assetsDir, 'icon.png');
  const tmpPath = iconPath + '.rounded.tmp.png';

  if (!fs.existsSync(iconPath)) {
    console.error('Missing', iconPath);
    process.exit(1);
  }

  const input = await fs.promises.readFile(iconPath);
  const size = 512;

  const resized = await sharp(input)
    .resize(size, size, { fit: 'cover' })
    .ensureAlpha()
    .png()
    .toBuffer();

  const r = Math.max(10, Math.round(size * 0.22));
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${size}" height="${size}" rx="${r}" ry="${r}" fill="white"/></svg>`,
  );

  await sharp(resized)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toFile(tmpPath);

  const outSz = (await fs.promises.stat(tmpPath)).size;
  if (outSz < 3000) {
    await fs.promises.unlink(tmpPath).catch(() => {});
    throw new Error(`round-app-icon produced tiny file (${outSz} bytes); refusing to overwrite icon.png`);
  }

  await fs.promises.rename(tmpPath, iconPath);
  console.log(`Icon ${size}x${size}: rounded corners rx=${r} -> ${iconPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
