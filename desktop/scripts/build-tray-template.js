#!/usr/bin/env node
/**
 * Builds macOS menu bar (Tray) template images from assets/icon.png.
 *
 * Apple expects template images: black glyph on transparent background, with
 * padding inside the canvas (Docker/Cursor follow this). White-on-black PNGs
 * look huge and harsh in the menu bar.
 *
 * Outputs:
 *   assets/iconTemplate.png    — 22×22 @1x
 *   assets/iconTemplate@2x.png — 44×44 @2x (Electron loads both automatically)
 *
 * Run: npm run icons:tray
 */
const fs = require('fs');
const path = require('path');

async function main() {
  const sharp = require('sharp');
  const assetsDir = path.join(__dirname, '..', 'assets');
  const srcPath = path.join(assetsDir, 'icon.png');
  if (!fs.existsSync(srcPath)) {
    console.error('Missing', srcPath);
    process.exit(1);
  }

  const input = await fs.promises.readFile(srcPath);
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const ch = info.channels;
  const out = Buffer.alloc(w * h * 4, 0);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      const oi = (y * w + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      const lum = (r + g + b) / 3;
      if (a < 25) {
        out[oi + 3] = 0;
        continue;
      }
      // White / light strokes → black template ink; dark backgrounds → transparent
      if (lum > 95) {
        out[oi] = 0;
        out[oi + 1] = 0;
        out[oi + 2] = 0;
        out[oi + 3] = 255;
      }
    }
  }

  const silhouette = sharp(out, { raw: { width: w, height: h, channels: 4 } }).png();

  const trimmed = await silhouette.clone().trim().toBuffer({ resolveWithObject: true });
  const tw = trimmed.info.width;
  const th = trimmed.info.height;

  async function writePacked(outFile, canvasPx, maxGlyphPx) {
    const scale = Math.min(maxGlyphPx / tw, maxGlyphPx / th, 1);
    const nw = Math.max(1, Math.round(tw * scale));
    const nh = Math.max(1, Math.round(th * scale));
    const resized = await sharp(trimmed.data)
      .resize(nw, nh, { kernel: sharp.kernel.lanczos3 })
      .png()
      .toBuffer();

    const left = Math.floor((canvasPx - nw) / 2);
    const top = Math.floor((canvasPx - nh) / 2);

    await sharp({
      create: {
        width: canvasPx,
        height: canvasPx,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: resized, left, top }])
      .png()
      .toFile(outFile);
  }

  const out1x = path.join(assetsDir, 'iconTemplate.png');
  const out2x = path.join(assetsDir, 'iconTemplate@2x.png');

  await writePacked(out1x, 22, 14);
  await writePacked(out2x, 44, 28);

  console.log(`Wrote ${out1x} (22×22) and ${out2x} (44×44) — black-on-clear template with padding`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
